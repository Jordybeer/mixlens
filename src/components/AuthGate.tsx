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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">MixLens</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>AI-powered mix feedback</p>
          </div>

          <div className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-panel)' }}>
              {(['login', 'signup'] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null) }}
                  className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={mode === m
                    ? { background: 'var(--bg-surface)', color: 'var(--text)', boxShadow: '0 1px 3px var(--border)' }
                    : { color: 'var(--text-muted)' }
                  }
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jij@voorbeeld.com"
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Wachtwoord</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
              {error && (
                <p className="text-xs rounded-lg px-3 py-2"
                  style={error.includes('confirm')
                    ? { color: 'var(--sev-minor)', background: 'color-mix(in srgb, var(--sev-minor) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sev-minor) 25%, transparent)' }
                    : { color: 'var(--sev-critical)', background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)' }
                  }
                >{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg disabled:opacity-40 transition-colors text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                {busy ? 'Even geduld…' : mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
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
