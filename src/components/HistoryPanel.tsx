'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { LeanHistoryEntry } from '@/store/useAnalysisStore'

function SeverityDot({ count, color }: { count: number; color: string }) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
      {count}
    </span>
  )
}

export default function HistoryPanel() {
  const { history, loadFromHistory, clearHistory } = useAnalysisStore()
  const [open, setOpen] = useState(false)

  if (history.length === 0) return null

  function countBySeverity(entry: LeanHistoryEntry) {
    return {
      critical:   entry.feedbackItems.filter((f) => f.severity === 'CRITICAL').length,
      important:  entry.feedbackItems.filter((f) => f.severity === 'IMPORTANT').length,
      validation: entry.feedbackItems.filter((f) => f.severity === 'VALIDATION').length,
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
      >
        ◷ History ({history.length})
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-80 bg-[#1c1b19] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs text-white/50 uppercase tracking-widest">Recent analyses</span>
            <button
              onClick={() => { clearHistory(); setOpen(false) }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear all
            </button>
          </div>

          <ul className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {history.map((entry) => {
              const { critical, important, validation } = countBySeverity(entry)
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => { loadFromHistory(entry); setOpen(false) }}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <p className="text-sm text-white/80 truncate font-medium">{entry.fileName}</p>
                    <p className="text-xs text-white/30 mt-0.5 font-mono">
                      {new Date(entry.analysedAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {' · '}{formatTime(entry.durationSeconds)}
                      {entry.bpm  ? ` · ${entry.bpm} BPM` : ''}
                      {entry.key  ? ` · ${entry.key}`     : ''}
                    </p>
                    <p className="text-xs text-white/25 mt-1 line-clamp-2 leading-relaxed">
                      {entry.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <SeverityDot count={critical}   color="#dd6974" />
                      <SeverityDot count={important}  color="#fbbf24" />
                      <SeverityDot count={validation} color="#6daa45" />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
