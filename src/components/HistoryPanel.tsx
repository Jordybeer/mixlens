'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'

export default function HistoryPanel() {
  const { history, loadFromHistory, clearHistory } = useAnalysisStore()
  const [open, setOpen] = useState(false)

  if (history.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
      >
        ◷ History ({history.length})
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-72 bg-[#1c1b19] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs text-white/50 uppercase tracking-widest">Recent tracks</span>
            <button
              onClick={() => { clearHistory(); setOpen(false) }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => { loadFromHistory(entry); setOpen(false) }}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <p className="text-sm text-white/80 truncate">{entry.fileName}</p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {new Date(entry.analysedAt).toLocaleDateString()} · {formatTime(entry.result.durationSeconds)}
                    {entry.result.bpm ? ` · ${entry.result.bpm} BPM` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
