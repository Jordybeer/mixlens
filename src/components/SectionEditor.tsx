'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { Section } from '@/types/analysis'

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const SECTION_COLORS = [
  'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/20',
  'bg-[var(--color-gold)]/15 border-[var(--color-gold)]/20',
  'bg-[var(--color-success)]/15 border-[var(--color-success)]/20',
  'bg-[var(--color-error)]/15 border-[var(--color-error)]/20',
  'bg-[var(--color-notification)]/15 border-[var(--color-notification)]/20',
]

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
      label: `Section ${sections.length + 1}`,
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
        <p className="text-xs text-white/40 uppercase tracking-widest">Sections</p>
        <div className="flex items-center gap-2">
          {seekTime !== null && (
            <span className="text-xs font-mono text-[var(--color-primary)]">⊙ {fmtTime(seekTime)}</span>
          )}
          <button
            onClick={handleAddSection}
            className="text-xs px-2.5 py-1 rounded-md border border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          >
            + Add at playhead
          </button>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="text-xs text-white/25 py-2">No sections defined. Use the energy chart to set the playhead, then add a section.</p>
      )}

      <div className="space-y-1.5">
        {sections.map((sec, i) => (
          <div
            key={sectionKey(sec, i)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${SECTION_COLORS[i % SECTION_COLORS.length]}`}
          >
            <button
              onClick={() => setSeekTo(sec.startSeconds)}
              className="font-mono text-white/40 hover:text-white/70 shrink-0 transition-colors"
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
                  className="flex-1 bg-white/5 border border-white/15 rounded px-2 py-0.5 text-xs focus:outline-none"
                />
                <button type="submit" className="text-white/60 hover:text-white px-1">✓</button>
                <button type="button" onClick={() => setEditing(null)} className="text-white/30 hover:text-white/60 px-1">×</button>
              </form>
            ) : (
              <button
                onClick={() => { setEditing(i); setEditLabel(sec.label) }}
                className="flex-1 text-left text-white/70 hover:text-white transition-colors truncate"
              >
                {sec.label}
              </button>
            )}

            <span className="text-white/25 font-mono shrink-0">
              {sec.endSeconds ? fmtTime(sec.endSeconds) : '—'}
            </span>

            <button
              onClick={() => handleDelete(i)}
              className="text-white/20 hover:text-[var(--color-notification)] transition-colors shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setUserSections([])}
        className="text-xs text-[var(--color-primary)] hover:text-[#7fc4cc] px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
      >
        Clear all sections
      </button>
    </div>
  )
}
