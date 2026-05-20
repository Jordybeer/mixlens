'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const { setActiveProject, activeProjectId, clearActiveProject } = useProjectStore()
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

  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

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

  function startEdit(p: Project) {
    setConfirmDeleteId(null)
    setEditingId(p.id)
    setEditName(p.name)
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed) { setEditingId(null); return }
    const { error } = await supabase
      .from('projects')
      .update({ name: trimmed })
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) {
      setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name: trimmed } : p))
    }
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) {
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (activeProjectId === id) clearActiveProject()
    }
    setConfirmDeleteId(null)
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
            <li key={p.id} className="flex items-center gap-2">
              {editingId === p.id ? (
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveEdit(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(p.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--accent)',
                    color: 'var(--text)',
                  }}
                />
              ) : (
                <button
                  onClick={() => {
                    setConfirmDeleteId(null)
                    setActiveProject(p.id, p.name)
                  }}
                  className="flex-1 text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
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
              )}

              {/* Rename button */}
              {editingId !== p.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(p) }}
                  title="Rename"
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                  style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H2v-3L11.5 2.5z"/>
                  </svg>
                </button>
              )}

              {/* Delete / confirm delete */}
              {editingId !== p.id && (
                confirmDeleteId === p.id ? (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="px-2.5 h-8 rounded-lg text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap"
                    style={{ background: 'color-mix(in srgb, var(--sev-critical) 15%, transparent)', color: 'var(--sev-critical)', border: '1px solid color-mix(in srgb, var(--sev-critical) 40%, transparent)' }}
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                    title="Delete"
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
                    style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}
                    onBlur={() => setConfirmDeleteId(null)}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 4 13 12 13 13 6"/>
                      <path d="M1 4h14M6 4V2h4v2"/>
                    </svg>
                  </button>
                )
              )}
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
