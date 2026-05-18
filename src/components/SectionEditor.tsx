'use client'

import { useEffect, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { Section } from '@/types/analysis'

const PRESETS = [
  'intro', 'verse', 'pre-chorus', 'chorus', 'build', 'drop',
  'breakdown', 'bridge', 'hook', 'outro', 'full track',
]

function parseTime(val: string): number | null {
  val = val.trim()
  if (!val) return null
  if (val.includes(':')) {
    const parts = val.split(':')
    const m = parseInt(parts[0], 10)
    const s = parseFloat(parts[1])
    if (isNaN(m) || isNaN(s)) return null
    return m * 60 + s
  }
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

let _uid = 0
const uid = () => ++_uid

interface Row { id: number; label: string; start: string }

function sectionsToRows(sections: Section[]): Row[] {
  return sections.map((s) => ({ id: uid(), label: s.label, start: fmtTime(s.startSeconds) }))
}

interface Props {
  duration: number
  seekTime: number | null
  onChange: (sections: Section[]) => void
}

export default function SectionEditor({ duration, seekTime, onChange }: Props) {
  const { userSections, setUserSections, result } = useAnalysisStore()

  const [rows, setRows] = useState<Row[]>(() => {
    // Seed from persisted userSections, else from AI result sections, else default
    if (userSections && userSections.length > 0) return sectionsToRows(userSections)
    if (result?.sections?.length) return sectionsToRows(result.sections)
    return [{ id: uid(), label: 'intro', start: '0:00' }]
  })

  // When result changes (new analysis), re-seed rows from result.sections
  useEffect(() => {
    if (!userSections && result?.sections?.length) {
      setRows(sectionsToRows(result.sections))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.sections])

  function toSections(r: Row[]): Section[] {
    const sorted = [...r].sort((a, b) => (parseTime(a.start) ?? 0) - (parseTime(b.start) ?? 0))
    return sorted.map((row, i) => ({
      label: row.label || 'section',
      startSeconds: parseTime(row.start) ?? 0,
      endSeconds: sorted[i + 1] ? (parseTime(sorted[i + 1].start) ?? duration) : duration,
    }))
  }

  function update(id: number, field: 'label' | 'start', value: string) {
    const next = rows.map((r) => r.id === id ? { ...r, [field]: value } : r)
    setRows(next)
    const sections = toSections(next)
    setUserSections(sections)
    onChange(sections)
  }

  function addRow() {
    const next = [...rows, { id: uid(), label: '', start: '' }]
    setRows(next)
    const sections = toSections(next)
    setUserSections(sections)
    onChange(sections)
  }

  function removeRow(id: number) {
    if (rows.length <= 1) return
    const next = rows.filter((r) => r.id !== id)
    setRows(next)
    const sections = toSections(next)
    setUserSections(sections)
    onChange(sections)
  }

  function applySeek(id: number) {
    if (seekTime == null) return
    update(id, 'start', fmtTime(seekTime))
  }

  return (
    <div className="space-y-3">
      <datalist id="section-presets">
        {PRESETS.map((p) => <option key={p} value={p} />)}
      </datalist>

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 uppercase tracking-widest">Arrangement</p>
        <p className="text-xs text-white/20">
          {seekTime != null
            ? <span className="text-[#4f98a3]">⊙ {fmtTime(seekTime)} — hit <em>use</em> on a row</span>
            : 'hover chart · hit + Stamp'}
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="text"
              list="section-presets"
              value={row.label}
              onChange={(e) => update(row.id, 'label', e.target.value)}
              placeholder="name…"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/20 placeholder:text-white/20"
            />
            <input
              type="text"
              value={row.start}
              onChange={(e) => update(row.id, 'start', e.target.value)}
              placeholder="0:00"
              className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm font-mono text-center focus:outline-none focus:border-white/20 placeholder:text-white/20"
            />
            {seekTime != null && (
              <button
                onClick={() => applySeek(row.id)}
                className="text-xs text-[#4f98a3] hover:text-[#7fc4cc] px-2 py-2 rounded-lg hover:bg-[#4f98a3]/10 transition-colors shrink-0"
              >
                use
              </button>
            )}
            <button
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
              className="text-white/20 hover:text-white/50 disabled:opacity-0 transition-colors text-xl leading-none w-7 text-center shrink-0"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors py-1"
      >
        <span className="text-base leading-none text-white/40">+</span> Add section
      </button>

      {duration > 0 && (
        <p className="text-xs text-white/15">Track length: {fmtTime(duration)}</p>
      )}
    </div>
  )
}
