'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { Severity } from '@/types/analysis'

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'IMPORTANT', 'MINOR', 'VALIDATION']

export default function FeedbackList() {
  const { result, updateFeedbackStatus } = useAnalysisStore()
  if (!result) return null

  const sorted = [...result.feedbackItems].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 uppercase tracking-widest">Feedback ({sorted.length})</p>
      {sorted.map((item) => (
        <div
          key={item.id}
          className={`severity-bg-${item.severity} border rounded-xl p-4 space-y-2 ${
            item.status === 'ignored' ? 'opacity-30' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {item.timestamp !== null && (
              <span className="text-xs font-mono text-white/50">
                @{formatTime(item.timestamp)}
              </span>
            )}
            <span className={`text-xs font-semibold uppercase tracking-widest severity-${item.severity}`}>
              {item.severity}
            </span>
          </div>

          <p className="text-xs text-white/50">{item.observation}</p>
          <p className="text-sm text-white/85 leading-relaxed">{item.feedback}</p>

          {item.status === 'pending' && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => updateFeedbackStatus(item.id, 'todo')}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                + Add To-Do
              </button>
              <button
                onClick={() => updateFeedbackStatus(item.id, 'ignored')}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                Ignore
              </button>
            </div>
          )}
          {item.status === 'todo' && (
            <span className="text-xs text-[#4f98a3]">✓ Added to To-Do</span>
          )}
        </div>
      ))}
    </div>
  )
}
