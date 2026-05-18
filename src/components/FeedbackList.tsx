'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { Severity } from '@/types/analysis'

const SEVERITIES: (Severity | 'ALL')[] = ['ALL', 'CRITICAL', 'IMPORTANT', 'MINOR', 'VALIDATION']

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  IMPORTANT: 'Important',
  MINOR: 'Minor',
  VALIDATION: 'Good',
}

export default function FeedbackList() {
  const {
    result,
    severityFilter,
    todoFilter,
    setSeverityFilter,
    setTodoFilter,
    setSeekTo,
    updateFeedbackStatus,
  } = useAnalysisStore()

  if (!result) return null

  const todoItems = result.feedbackItems.filter((i) => i.status === 'todo')
  const allItems = todoFilter
    ? todoItems
    : severityFilter === 'ALL'
    ? result.feedbackItems
    : result.feedbackItems.filter((i) => i.severity === severityFilter)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setTodoFilter(false)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !todoFilter ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          All feedback
        </button>
        <button
          onClick={() => setTodoFilter(true)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
            todoFilter ? 'bg-[#4f98a3]/30 text-[#4f98a3]' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Todo
          {todoItems.length > 0 && (
            <span className="bg-[#4f98a3] text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {todoItems.length}
            </span>
          )}
        </button>

        {!todoFilter && (
          <div className="flex gap-1 ml-2">
            {SEVERITIES.map((s) => {
              const count = s === 'ALL'
                ? result.feedbackItems.length
                : result.feedbackItems.filter((i) => i.severity === s).length
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                    severityFilter === s
                      ? s === 'ALL' ? 'bg-white/15 text-white'
                        : `severity-bg-${s} severity-${s}`
                      : 'text-white/30 hover:text-white/60'
                  }`}
                >
                  {s === 'ALL' ? 'All' : SEVERITY_LABEL[s]} {count > 0 && `(${count})`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {todoFilter && todoItems.length === 0 && (
        <div className="text-center py-10 text-white/30 text-sm">
          No items marked as todo yet. Click + on any feedback item.
        </div>
      )}

      {allItems.map((item) => (
        <div
          key={item.id}
          className={`border rounded-xl p-4 space-y-2 transition-opacity ${
            item.status === 'ignored' ? 'opacity-40' : ''
          } severity-bg-${item.severity}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold uppercase tracking-wider severity-${item.severity}`}>
                {SEVERITY_LABEL[item.severity]}
              </span>
              {item.timestamp !== null && (
                <button
                  onClick={() => setSeekTo(item.timestamp)}
                  className="text-xs font-mono text-white/40 hover:text-white/70 transition-colors"
                >
                  @ {formatTime(item.timestamp)}
                </button>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                title="Mark as todo"
                onClick={() => updateFeedbackStatus(item.id, item.status === 'todo' ? 'pending' : 'todo')}
                className={`text-xs w-6 h-6 rounded flex items-center justify-center transition-colors ${
                  item.status === 'todo'
                    ? 'bg-[#4f98a3]/30 text-[#4f98a3]'
                    : 'text-white/20 hover:text-white/60'
                }`}
              >
                +
              </button>
              <button
                title="Ignore"
                onClick={() => updateFeedbackStatus(item.id, item.status === 'ignored' ? 'pending' : 'ignored')}
                className={`text-xs w-6 h-6 rounded flex items-center justify-center transition-colors ${
                  item.status === 'ignored'
                    ? 'bg-white/10 text-white/60'
                    : 'text-white/20 hover:text-white/60'
                }`}
              >
                ×
              </button>
            </div>
          </div>
          <p className="text-xs text-white/50">{item.observation}</p>
          <p className="text-sm text-white/85 leading-relaxed">{item.feedback}</p>
        </div>
      ))}
    </div>
  )
}
