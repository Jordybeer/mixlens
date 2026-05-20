'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { Severity, FeedbackCategory } from '@/types/analysis'

const SEVERITIES: (Severity | 'ALL')[] = ['ALL', 'CRITICAL', 'IMPORTANT', 'MINOR', 'VALIDATION']

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  IMPORTANT: 'Important',
  MINOR: 'Minor',
  VALIDATION: 'Good',
}

const CATEGORIES: FeedbackCategory[] = [
  'Low End',
  'Mix Balance',
  'Arrangement',
  'Tension & Energy',
  'Dynamics',
  'Stereo Width',
  'Vocals / Lead',
  'Master Check',
  'Next Steps',
]

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

  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | 'ALL'>('ALL')

  if (!result) return null

  const todoItems = result.feedbackItems.filter((i) => i.status === 'todo')
  const isDeepScan = result.isDeepScan ?? false

  const presentCategories = CATEGORIES.filter((cat) =>
    result.feedbackItems.some((i) => i.category === cat)
  )

  let allItems = todoFilter ? todoItems : result.feedbackItems

  if (!todoFilter && categoryFilter !== 'ALL') {
    allItems = allItems.filter((i) => i.category === categoryFilter)
  }
  if (!todoFilter && severityFilter !== 'ALL') {
    allItems = allItems.filter((i) => i.severity === severityFilter)
  }

  return (
    <div className="space-y-4">
      {/* ── Row 1: mode buttons ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setTodoFilter(false); setCategoryFilter('ALL') }}
          className="text-xs px-3 py-1.5 rounded-full transition-colors"
          style={!todoFilter
            ? { background: 'var(--overlay-medium)', color: 'var(--text)' }
            : { color: 'var(--text-muted)' }
          }
        >
          Alle feedback
        </button>
        <button
          onClick={() => setTodoFilter(true)}
          className="text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
          style={todoFilter
            ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }
            : { color: 'var(--text-muted)' }
          }
        >
          Todo
          {todoItems.length > 0 && (
            <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center text-white"
              style={{ background: 'var(--accent)' }}>
              {todoItems.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Row 2: severity pills (horizontal scroll, never wraps) ── */}
      {!todoFilter && (
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <div className="flex gap-1 flex-nowrap">
            {SEVERITIES.map((s) => {
              const base = s === 'ALL' ? result.feedbackItems : result.feedbackItems.filter((i) => i.severity === s)
              const count = categoryFilter !== 'ALL' ? base.filter((i) => i.category === categoryFilter).length : base.length
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-colors whitespace-nowrap ${
                    severityFilter === s
                      ? s === 'ALL' ? '' : `severity-bg-${s} severity-${s}`
                      : ''
                  }`}
                  style={severityFilter === s && s === 'ALL'
                    ? { background: 'var(--overlay-medium)', color: 'var(--text)' }
                    : severityFilter !== s
                    ? { color: 'var(--text-faint)' }
                    : {}
                  }
                >
                  {s === 'ALL' ? 'Alles' : SEVERITY_LABEL[s]} {count > 0 && `(${count})`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Category tabs ── */}
      {!todoFilter && (isDeepScan || presentCategories.length > 1) && (
        <div className="flex gap-1.5 flex-wrap pb-3 pt-2" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setCategoryFilter('ALL')}
            className="text-xs px-3 py-1 rounded-full border transition-colors"
            style={categoryFilter === 'ALL'
              ? { background: 'var(--overlay-medium)', color: 'var(--text)', borderColor: 'var(--border-hover)' }
              : { color: 'var(--text-faint)', borderColor: 'var(--border)' }
            }
          >
            Alles ({result.feedbackItems.length})
          </button>
          {presentCategories.map((cat) => {
            const count = result.feedbackItems.filter((i) => i.category === cat).length
            const isActive = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className="text-xs px-3 py-1 rounded-full border transition-colors"
                style={isActive
                  ? { background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                  : { color: 'var(--text-faint)', borderColor: 'var(--border)' }
                }
              >
                {cat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {todoFilter && todoItems.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--text-faint)' }}>
          Nog geen items als todo gemarkeerd. Klik + op een feedback-item.
        </div>
      )}

      {!todoFilter && allItems.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--text-faint)' }}>
          Geen items die overeenkomen met het huidige filter.
        </div>
      )}

      {allItems.map((item) => (
        <div
          key={item.id}
          className={`border rounded-xl p-4 space-y-2.5 transition-opacity ${
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
                  aria-label={`Seek to ${formatTime(item.timestamp)}`}
                  className="text-xs font-mono transition-colors px-1 h-6 rounded"
                  style={{ color: 'var(--accent)' }}
                >
                  @ {formatTime(item.timestamp)}
                </button>
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
            <div className="flex gap-1 shrink-0">
              <button
                title="Markeer als todo"
                onClick={() => updateFeedbackStatus(item.id, item.status === 'todo' ? 'pending' : 'todo')}
                className="text-xs px-3 h-8 rounded flex items-center justify-center transition-colors font-medium"
                style={item.status === 'todo'
                  ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }
                  : { color: 'var(--text-faint)', border: '1px solid var(--border)' }
                }
              >
                {item.status === 'todo' ? '✓ todo' : '+ todo'}
              </button>
              <button
                title="Negeer"
                aria-label={item.status === 'ignored' ? 'Unignore' : 'Ignore'}
                onClick={() => updateFeedbackStatus(item.id, item.status === 'ignored' ? 'pending' : 'ignored')}
                className="text-xs w-8 h-8 rounded flex items-center justify-center transition-colors"
                style={item.status === 'ignored'
                  ? { background: 'var(--overlay-medium)', color: 'var(--text-muted)' }
                  : { color: 'var(--text-faint)' }
                }
              >
                ×
              </button>
            </div>
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
