'use client'

const CHANGE_META = {
  improved:   { label: 'Improved',   color: 'text-[var(--color-success)]',       dot: 'bg-[var(--color-success)]' },
  regression: { label: 'Regression', color: 'text-[var(--color-notification)]',   dot: 'bg-[var(--color-notification)]' },
  neutral:    { label: 'Neutral',    color: 'text-white/50',                       dot: 'bg-white/30' },
  resolved:   { label: 'Resolved',   color: 'text-[var(--color-primary)]',        dot: 'bg-[var(--color-primary)]' },
}

const SCORE_BADGE = {
  better:  'border-[var(--color-success)]/40 text-[var(--color-success)]',
  worse:   'border-[var(--color-notification)]/40 text-[var(--color-notification)]',
  similar: 'border-white/20 text-white/50',
}

interface DimensionComparison {
  dimension: string
  change: keyof typeof CHANGE_META
  detail: string
}

export interface CompareResultData {
  overallVerdict: string
  overallScore?: keyof typeof SCORE_BADGE
  dimensionComparisons?: DimensionComparison[]
  resolvedIssues?: number
  newIssues?: number
  focusAnswer?: string
}

interface Props {
  compareResult: CompareResultData
}

export default function CompareResultView({ compareResult }: Props) {
  const { overallVerdict, overallScore, dimensionComparisons, resolvedIssues, newIssues, focusAnswer } = compareResult

  return (
    <div className="space-y-5 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 uppercase tracking-widest">Comparison Result</p>
        <p className="text-[var(--color-primary)] uppercase tracking-widest text-[10px]">V2</p>
      </div>

      {/* Overall verdict */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-1">
        <p className="text-sm font-medium text-white/80">{overallVerdict}</p>
        {overallScore && (
          <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full border ${
            SCORE_BADGE[overallScore]
          }`}>
            {overallScore}
          </span>
        )}
      </div>

      {/* Focus answer */}
      {focusAnswer && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/35 uppercase tracking-wider mb-2">Focus area response</p>
          <p className="text-sm text-white/75 leading-relaxed">{focusAnswer}</p>
        </div>
      )}

      {/* Dimension comparisons */}
      {dimensionComparisons && dimensionComparisons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/35 uppercase tracking-wider">Dimensions</p>
          {dimensionComparisons.map((dim, i) => {
            const meta = CHANGE_META[dim.change]
            return (
              <div key={i} className="bg-white/[0.03] border border-white/8 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/70">{dim.dimension}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">{dim.detail}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Resolved / new issues */}
      <div className="flex gap-3 flex-wrap">
        {resolvedIssues != null && resolvedIssues > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25">
            {resolvedIssues} resolved
          </span>
        )}
        {newIssues != null && newIssues > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-[var(--color-notification)]/10 text-[var(--color-notification)] border border-[var(--color-notification)]/25">
            {newIssues} new issues
          </span>
        )}
      </div>
    </div>
  )
}
