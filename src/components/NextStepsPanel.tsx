'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { Severity } from '@/types/analysis'

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  IMPORTANT: 'Important',
  MINOR: 'Minor',
  VALIDATION: 'Good',
}

export default function NextStepsPanel() {
  const { result, updateFeedbackStatus } = useAnalysisStore()

  const todos = result?.feedbackItems.filter((i) => i.status === 'todo') ?? []

  if (!result) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>
        Analyse a track first to build your next steps list.
      </div>
    )
  }

  if (todos.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No next steps yet.</p>
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          Click <span className="font-mono px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>+ todo</span> on any feedback card to add it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
        {todos.length} step{todos.length !== 1 ? 's' : ''} to work on
      </p>

      {todos.map((item) => (
        <div
          key={item.id}
          className={`border rounded-xl p-4 space-y-2 severity-bg-${item.severity}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`text-xs font-semibold uppercase tracking-wider severity-${item.severity}`}>
                {SEVERITY_LABEL[item.severity]}
              </span>
              {item.timestamp !== null && (
                <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
                  @ {formatTime(item.timestamp)}
                </span>
              )}
              {item.category && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--overlay-subtle)' }}
                >
                  {item.category}
                </span>
              )}
            </div>

            <button
              onClick={() => updateFeedbackStatus(item.id, 'done')}
              className="shrink-0 text-xs px-3 py-2 h-8 min-w-[96px] rounded-full font-medium transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              }}
            >
              ✔ completed
            </button>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.observation}</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{item.feedback}</p>

          {item.tags && item.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pt-0.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono rounded px-1.5 py-0.5 leading-none"
                  style={{ color: 'var(--text-faint)', border: '1px solid var(--border)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
