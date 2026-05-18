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
    if (data) {
      setProjects(data)
      // No auto-select — user picks explicitly from landing screen
    }
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
        className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5"
      >
        <span className="text-white/20">▣</span>
        <span className="max-w-[140px] truncate">{activeProjectName ?? 'Select project'}</span>
        <span className="text-white/20">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-60 bg-[var(--color-surface)] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/8">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Projects</p>
          </div>

          <ul className="max-h-48 overflow-y-auto divide-y divide-white/5">
            {projects.length === 0 && (
              <li className="px-3 py-3 text-xs text-white/25 text-center">No projects yet</li>
            )}
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => { setActiveProject(p.id, p.name); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.04] ${
                    p.id === activeProjectId ? 'text-white' : 'text-white/55'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {p.id === activeProjectId && <span className="w-1 h-1 rounded-full bg-[var(--color-primary)] shrink-0" />}
                    <span className="truncate">{p.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreate} className="px-3 py-2.5 border-t border-white/8 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New project name…"
              className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/25"
            />
            <button type="submit" disabled={busy} className="text-xs px-2.5 py-1.5 rounded-md bg-white/8 hover:bg-white/12 disabled:opacity-40 transition-colors">
              +
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
