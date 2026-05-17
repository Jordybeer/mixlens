'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { Severity } from '@/types/analysis'

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'IMPORTANT', 'MINOR', 'VALIDATION']
const FILTERS: (Severity | 'ALL')[] = ['ALL', 'CRITICAL', 'IMPORTANT', 'MINOR', 'VALIDATION']

export default function FeedbackList() {
  const { result, updateFeedbackStatus, severityFilter, setSeverityFilter, setSeekTo } = useAnalysisStore()
  if (!result) return null

  const sorted = [...result.feedbackItems]
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    .filter((item) => severityFilter === 'ALL' || item.severity === severityFilter)

  const counts = result.feedbackItems.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setSeverityFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              severityFilter === f
                ? f === 'ALL'
                  ? 'bg-white/10 border-white/30 text-white'
                  : `severity-bg-${f} severity-${f} border-current`
                : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
            }`}
          >
            {f}{f !== 'ALL' && counts[f] ? ` (${counts[f]})` : ''}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {sorted.length === 0 && (
          <p className="text-sm text-white/30 text-center py-8">No items for this filter</p>
        )}
        {sorted.map((item) => (
          <div
            key={item.id}
            className={`severity-bg-${item.severity} border rounded-xl p-4 space-y-2 transition-opacity ${
              item.status === 'ignored' ? 'opacity-30' : ''
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {item.timestamp !== null && (
                <button
                  onClick={() => setSeekTo(item.timestamp!)}
                  className="text-xs font-mono text-white/50 hover:text-[#4f98a3] transition-colors"
                  title="Seek to this point"
                >
                  @{formatTime(item.timestamp)}
                </button>
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
    </div>
  )
}
