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
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [hasKey, setHasKey] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .not('anthropic_api_key', 'is', null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[AuthGate] Failed to check API key:', error)
          setHasKey(false)
          setShowKeyModal(true)
          return
        }
        if (data) {
          setHasKey(true)
        } else {
          setHasKey(false)
          setShowKeyModal(true)
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

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">MixLens</h1>
            <p className="text-sm text-white/40">AI-powered mix feedback</p>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30"
                />
              </div>
              {error && (
                <p className={`text-xs rounded-lg px-3 py-2 ${
                  error.includes('confirm')
                    ? 'text-[var(--color-success)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/20'
                    : 'text-[var(--color-notification)] bg-[var(--color-notification)]/10 border border-[var(--color-notification)]/20'
                }`}>{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg bg-white/8 hover:bg-white/12 disabled:opacity-40 transition-colors text-sm font-medium"
              >
                {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      {showKeyModal && (
        <ApiKeyModal
          userId={user.id}
          onSaved={() => { setHasKey(true); setShowKeyModal(false) }}
          canDismiss={hasKey}
          onDismiss={() => setShowKeyModal(false)}
        />
      )}
    </>
  )
}
