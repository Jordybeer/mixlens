'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useProjectStore } from '@/store/useProjectStore'

interface Project {
  id: string
  name: string
  created_at: string
}

export default function ProjectSelector({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const { activeProjectId, activeProjectName, setActiveProject } = useProjectStore()
  const supabase = createClient()

  useEffect(() => {
    fetchProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setProjects(data)
  }

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
      setProjects((prev) => [data, ...prev])
      setActiveProject(data.id, data.name)
      setNewName('')
      setOpen(false)
    }
    setBusy(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs flex items-center gap-1.5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--text-muted)' }}
      >
        <span style={{ color: 'var(--text-faint)' }}>▣</span>
        <span className="max-w-[140px] truncate">{activeProjectName ?? 'Project selecteren'}</span>
        <span style={{ color: 'var(--text-faint)' }}>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-60 rounded-xl shadow-xl overflow-hidden"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Projecten</p>
          </div>

          <ul className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
            {projects.length === 0 && (
              <li className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                Nog geen projecten
              </li>
            )}
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => { setActiveProject(p.id, p.name); setOpen(false) }}
                  className="w-full text-left px-3 py-2.5 text-sm transition-opacity hover:opacity-70"
                  style={{ color: p.id === activeProjectId ? 'var(--text)' : 'var(--text-muted)' }}
                >
                  <span className="flex items-center gap-2">
                    {p.id === activeProjectId && (
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                    )}
                    <span className="truncate">{p.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreate} className="px-3 py-2.5 flex gap-2"
            style={{ borderTop: '1px solid var(--border)' }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nieuwe projectnaam…"
              className="flex-1 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
            <button type="submit" disabled={busy}
              className="text-xs px-2.5 py-1.5 rounded-md disabled:opacity-40 transition-opacity hover:opacity-70"
              style={{ background: 'var(--overlay-medium)', color: 'var(--text-muted)' }}>
              +
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
