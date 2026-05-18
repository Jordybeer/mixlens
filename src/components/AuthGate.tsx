'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { signIn, signUp, signOut } from '@/lib/auth'
import type { User } from '@supabase/supabase-js'
import ApiKeyModal from './ApiKeyModal'
import ProjectSelector from './ProjectSelector'

interface Props {
  children: React.ReactNode
}

type AuthMode = 'login' | 'signup'

export default function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = loading
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [hasKey, setHasKey] = useState(true)

  const supabase = createClient()

  // Subscribe to auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After user resolves, check if they have an API key
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const key = data?.anthropic_api_key as string | undefined
        if (!key) {
          setHasKey(false)
          setShowKeyModal(true)
        } else {
          setHasKey(true)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        await signUp(email, password)
        setError('Check your email to confirm your account, then log in.')
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Loading
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#0e0e0f] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1] flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">MixLens</h1>
            <p className="text-sm text-white/40">AI-powered mix feedback</p>
          </div>

          {/* Card */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {(['login', 'signup'] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null) }}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === m ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-white/50">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/50">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30"
                />
              </div>

              {error && (
                <p className={`text-xs px-3 py-2 rounded-lg border ${
                  error.startsWith('Check') 
                    ? 'bg-[#6daa45]/10 border-[#6daa45]/30 text-[#6daa45]'
                    : 'bg-[#dd6974]/10 border-[#dd6974]/30 text-[#dd6974]'
                }`}>{error}</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium mt-1"
              >
                {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-white/20">
            Your Anthropic API key is stored encrypted in your account.
          </p>
        </div>
      </div>
    )
  }

  // Logged in — show API key modal if missing, otherwise render app
  return (
    <>
      {showKeyModal && (
        <ApiKeyModal
          userId={user.id}
          onSaved={() => { setHasKey(true); setShowKeyModal(false) }}
          canDismiss={hasKey}
          onDismiss={() => setShowKeyModal(false)}
        />
      )}
      {/* Pass user + signOut + project selector + settings trigger to children via a header wrapper */}
      <AuthedShell
        user={user}
        onSignOut={signOut}
        onOpenKeyModal={() => setShowKeyModal(true)}
      >
        {children}
      </AuthedShell>
    </>
  )
}

function AuthedShell({
  children,
  user,
  onSignOut,
  onOpenKeyModal,
}: {
  children: React.ReactNode
  user: User
  onSignOut: () => void
  onOpenKeyModal: () => void
}) {
  return (
    <div data-user-id={user.id}>
      {/* Inject context via CSS custom property so child components can read it without prop-drilling */}
      <style>{`:root { --ml-user-id: "${user.id}"; }`}</style>
      {/* Pass a global event bus so the page header can add the settings + sign-out buttons */}
      <div id="__auth_shell" data-user-email={user.email} data-sign-out="true" data-open-key-modal="true" className="hidden" />
      <ShellHeader user={user} onSignOut={onSignOut} onOpenKeyModal={onOpenKeyModal} />
      {children}
    </div>
  )
}

function ShellHeader({ user, onSignOut, onOpenKeyModal }: { user: User; onSignOut: () => void; onOpenKeyModal: () => void }) {
  return (
    <div id="__shell_header" className="flex items-center gap-3">
      {/* This hidden div carries user info + action handlers — the page's own header reads them via the ProjectSelector and a context */}
      <input type="hidden" id="__user_id" value={user.id} />
      <input type="hidden" id="__user_email" value={user.email ?? ''} />
      <button
        id="__btn_key_modal"
        onClick={onOpenKeyModal}
        className="hidden"
        aria-label="Open API key settings"
      />
      <button
        id="__btn_sign_out"
        onClick={onSignOut}
        className="hidden"
        aria-label="Sign out"
      />
    </div>
  )
}
