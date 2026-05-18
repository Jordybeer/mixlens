'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  userId: string
  onSaved: () => void
  canDismiss: boolean
  onDismiss: () => void
}

export default function ApiKeyModal({ userId, onSaved, canDismiss, onDismiss }: Props) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Store previously focused element and set initial focus
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    inputRef.current?.focus()

    return () => {
      previousFocusRef.current?.focus()
    }
  }, [])

  // Focus trap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !modalRef.current) return

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleDismiss() {
    previousFocusRef.current?.focus()
    onDismiss()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!key.trim().startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: upsertError } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: userId, anthropic_api_key: key.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      if (upsertError) throw new Error(upsertError.message)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-modal-title"
        className="w-full max-w-md bg-[#1c1b19] border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="api-key-modal-title" className="text-base font-semibold">Anthropic API Key</h2>
            <p className="text-xs text-white/40 mt-0.5">Required to run analysis. Stored securely in your account.</p>
          </div>
          {canDismiss && (
            <button onClick={handleDismiss} className="text-white/30 hover:text-white/60 text-xl leading-none mt-0.5">×</button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-white/50">API Key</label>
            <input
              ref={inputRef}
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-api03-…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
          {error && (
            <p className="text-xs text-[#dd6974] bg-[#dd6974]/10 border border-[#dd6974]/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-[#4f98a3] hover:underline"
          >
            Get your key from console.anthropic.com →
          </a>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-40 transition-colors text-sm font-medium"
          >
            {busy ? 'Saving…' : 'Save key'}
          </button>
        </form>
      </div>
    </div>
  )
}
