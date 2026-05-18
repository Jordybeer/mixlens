'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useProjectStore } from '@/store/useProjectStore'

interface Project {
  id: string
  name: string
  created_at: string
}

export default function ProjectLandingPicker({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const { setActiveProject } = useProjectStore()
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data ?? [])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), user_id: userId })
      .select('id, name, created_at')
      .single()
    if (!error && data) {
      setActiveProject(data.id, data.name)
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm" style={{ color: 'var(--text-faint)' }}>Loading…</span>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-16 space-y-8">
      <div className="space-y-1">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Your projects</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pick a project to open, or create a new one.</p>
      </div>

      {projects.length > 0 ? (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setActiveProject(p.id, p.name)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                <span className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-faint)', lineHeight: 1 }}>▣</span>
                  <span>{p.name}</span>
                </span>
                <span style={{ color: 'var(--text-faint)' }}>›</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-8 rounded-xl" style={{ border: '1px dashed var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No projects yet — create one below.</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>New project</p>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name…"
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {busy ? '…' : 'Create'}
          </button>
        </form>
      </div>
    </div>
  )
}
