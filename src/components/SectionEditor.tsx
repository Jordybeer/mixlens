'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { Section } from '@/types/analysis'

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Local editing key: use label as stable-ish key within a session
function sectionKey(sec: Section, i: number) {
  return `${sec.label}-${i}`
}

export default function SectionEditor() {
  const { result, seekTo: storeSeekTo, setSeekTo, setUserSections } = useAnalysisStore()
  const [editing, setEditing] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')

  const seekTime = storeSeekTo

  if (!result) return null
  const sections: Section[] = result.sections ?? []
  const duration = result.durationSeconds

  function handleAddSection() {
    const t = seekTime ?? 0
    const newSec: Section = {
      label: `Sectie ${sections.length + 1}`,
      startSeconds: Math.round(t),
      endSeconds: duration,
    }
    const updated = [...sections, newSec].sort((a, b) => a.startSeconds - b.startSeconds)
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], endSeconds: updated[i + 1]?.startSeconds ?? duration }
    }
    setUserSections(updated)
  }

  function handleDelete(idx: number) {
    const updated = sections.filter((_, i) => i !== idx)
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], endSeconds: updated[i + 1]?.startSeconds ?? duration }
    }
    setUserSections(updated)
  }

  function handleRename(idx: number) {
    const updated = sections.map((s, i) =>
      i === idx ? { ...s, label: editLabel } : s
    )
    setUserSections(updated)
    setEditing(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Secties</p>
        <div className="flex items-center gap-2">
          {seekTime !== null && (
            <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>⊙ {fmtTime(seekTime)}</span>
          )}
          <button
            onClick={handleAddSection}
            className="text-xs px-2.5 py-1 rounded-md border transition-colors"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}
          >
            + Toevoegen bij positie
          </button>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="text-xs py-2" style={{ color: 'var(--text-faint)' }}>
          Geen secties gedefinieerd. Gebruik de energiegrafiek om de positie in te stellen, dan een sectie toevoegen.
        </p>
      )}

      <div className="space-y-1.5">
        {sections.map((sec, i) => (
          <div
            key={sectionKey(sec, i)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <button
              onClick={() => setSeekTo(sec.startSeconds)}
              className="font-mono shrink-0 transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-faint)' }}
            >
              {fmtTime(sec.startSeconds)}
            </button>

            {editing === i ? (
              <form
                onSubmit={(e) => { e.preventDefault(); handleRename(i) }}
                className="flex-1 flex gap-1"
              >
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="flex-1 rounded px-2 py-0.5 text-xs focus:outline-none"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button type="submit" className="px-1 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}>✓</button>
                <button type="button" onClick={() => setEditing(null)} className="px-1 transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-faint)' }}>×</button>
              </form>
            ) : (
              <button
                onClick={() => { setEditing(i); setEditLabel(sec.label) }}
                className="flex-1 text-left transition-opacity hover:opacity-70 truncate"
                style={{ color: 'var(--text)' }}
              >
                {sec.label}
              </button>
            )}

            <span className="font-mono shrink-0" style={{ color: 'var(--text-faint)' }}>
              {sec.endSeconds ? fmtTime(sec.endSeconds) : '—'}
            </span>

            <button
              onClick={() => handleDelete(i)}
              className="shrink-0 transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-faint)' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setUserSections([])}
        className="text-xs px-2 py-2 rounded-lg transition-opacity hover:opacity-70"
        style={{ color: 'var(--accent)' }}
      >
        Alle secties wissen
      </button>
    </div>
  )
}
