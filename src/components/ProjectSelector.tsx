'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useProjectStore, type Project } from '@/store/useProjectStore'

interface Props {
  userId: string
}

export default function ProjectSelector({ userId }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { activeProjectId, activeProjectName, setActiveProject } = useProjectStore()

  const supabase = createClient()

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setProjects(data as Project[])
  }

  useEffect(() => {
    loadProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Auto-select first project if none active
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(projects[0].id, projects[0].name)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: userId, name })
      .select('id, name, created_at')
      .single()
    if (!error && data) {
      const p = data as Project
      setProjects((prev) => [p, ...prev])
      setActiveProject(p.id, p.name)
      setNewName('')
      setCreating(false)
      setOpen(false)
    }
    setBusy(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors border border-white/10 rounded-lg px-2.5 py-1.5"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 3.5h10M1 6h7M1 8.5h4"/>
        </svg>
        <span className="max-w-[120px] truncate">{activeProjectName ?? 'No project'}</span>
        <span className="text-white/20">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-60 bg-[#1c1b19] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          {projects.length === 0 && !creating ? (
            <p className="text-xs text-white/30 text-center py-5">No projects yet</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-white/5">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => { setActiveProject(p.id, p.name); setOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      p.id === activeProjectId
                        ? 'bg-white/8 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="truncate block">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-white/10 p-2">
            {creating ? (
              <form onSubmit={createProject} className="flex gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name…"
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-white/30 placeholder:text-white/25"
                />
                <button type="submit" disabled={busy} className="text-xs px-2.5 py-1.5 rounded-md bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-40 transition-colors">
                  {busy ? '…' : 'Add'}
                </button>
                <button type="button" onClick={() => setCreating(false)} className="text-xs text-white/30 hover:text-white/60 px-1">
                  ×
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-xs text-white/40 hover:text-white/70 py-1.5 flex items-center gap-1.5 justify-center transition-colors"
              >
                <span className="text-sm leading-none">+</span> New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
