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
  'Stereo Width',
  'Vocals / Lead',
  'Master Check',
  'Next Steps',
]

const CATEGORY_COLOR: Record<FeedbackCategory, string> = {
  'Low End':         'text-[var(--color-primary)] border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10',
  'Mix Balance':     'text-white/70 border-white/20 bg-white/5',
  'Arrangement':     'text-white/70 border-white/20 bg-white/5',
  'Tension & Energy':'text-[var(--color-gold)] border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10',
  'Stereo Width':    'text-white/70 border-white/20 bg-white/5',
  'Vocals / Lead':   'text-[var(--color-error)] border-[var(--color-error)]/40 bg-[var(--color-error)]/10',
  'Master Check':    'text-[var(--color-success)] border-[var(--color-success)]/40 bg-[var(--color-success)]/10',
  'Next Steps':      'text-[var(--color-primary)] border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10',
}

const CATEGORY_TAB_ACTIVE: Record<FeedbackCategory, string> = {
  'Low End':         'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/50',
  'Mix Balance':     'bg-white/10 text-white border-white/30',
  'Arrangement':     'bg-white/10 text-white border-white/30',
  'Tension & Energy':'bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/50',
  'Stereo Width':    'bg-white/10 text-white border-white/30',
  'Vocals / Lead':   'bg-[var(--color-error)]/20 text-[var(--color-error)] border-[var(--color-error)]/50',
  'Master Check':    'bg-[var(--color-success)]/20 text-[var(--color-success)] border-[var(--color-success)]/50',
  'Next Steps':      'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border-[var(--color-primary)]/50',
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
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => { setTodoFilter(false); setCategoryFilter('ALL') }}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !todoFilter ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          All feedback
        </button>
        <button
          onClick={() => setTodoFilter(true)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
            todoFilter ? 'bg-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Todo
          {todoItems.length > 0 && (
            <span className="bg-[var(--color-primary)] text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {todoItems.length}
            </span>
          )}
        </button>

        {!todoFilter && (
          <div className="flex gap-1 ml-2 flex-wrap">
            {SEVERITIES.map((s) => {
              const base = s === 'ALL' ? result.feedbackItems : result.feedbackItems.filter((i) => i.severity === s)
              const count = categoryFilter !== 'ALL' ? base.filter((i) => i.category === categoryFilter).length : base.length
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

      {!todoFilter && (isDeepScan || presentCategories.length > 1) && (
        <div className="flex gap-1.5 flex-wrap border-b border-white/8 pb-3">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              categoryFilter === 'ALL'
                ? 'bg-white/12 text-white border-white/25'
                : 'text-white/35 border-white/10 hover:text-white/60 hover:border-white/20'
            }`}
          >
            All ({result.feedbackItems.length})
          </button>
          {presentCategories.map((cat) => {
            const count = result.feedbackItems.filter((i) => i.category === cat).length
            const isActive = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  isActive
                    ? CATEGORY_TAB_ACTIVE[cat]
                    : 'text-white/35 border-white/10 hover:text-white/60 hover:border-white/20'
                }`}
              >
                {cat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {todoFilter && todoItems.length === 0 && (
        <div className="text-center py-10 text-white/30 text-sm">
          No items marked as todo yet. Click + on any feedback item.
        </div>
      )}

      {!todoFilter && allItems.length === 0 && (
        <div className="text-center py-10 text-white/30 text-sm">
          No items match the current filter.
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
                  className="text-xs font-mono text-white/40 hover:text-white/70 transition-colors"
                >
                  @ {formatTime(item.timestamp)}
                </button>
              )}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border leading-tight ${
                CATEGORY_COLOR[item.category ?? 'Mix Balance']
              }`}>
                {item.category ?? 'Mix Balance'}
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                title="Mark as todo"
                onClick={() => updateFeedbackStatus(item.id, item.status === 'todo' ? 'pending' : 'todo')}
                className={`text-xs w-6 h-6 rounded flex items-center justify-center transition-colors ${
                  item.status === 'todo'
                    ? 'bg-[var(--color-primary)]/30 text-[var(--color-primary)]'
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

          <p className="text-xs text-white/50 leading-relaxed">{item.observation}</p>
          <p className="text-sm text-white/85 leading-relaxed">{item.feedback}</p>

          {item.tags && item.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pt-0.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-mono text-white/30 border border-white/10 rounded px-1.5 py-0.5 leading-none"
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
