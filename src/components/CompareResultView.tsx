'use client'

interface DimensionComparison {
  dimension: string
  change: 'improved' | 'regression' | 'neutral' | 'resolved'
  detail: string
}

export interface CompareResultData {
  overallVerdict: string
  overallScore?: 'better' | 'worse' | 'similar'
  dimensionComparisons?: DimensionComparison[]
  resolvedIssues?: number
  newIssues?: number
  focusAnswer?: string
}

interface Props {
  compareResult: CompareResultData
}

function changeStyle(change: DimensionComparison['change']): React.CSSProperties {
  switch (change) {
    case 'improved':   return { color: 'var(--sev-minor)' }
    case 'regression': return { color: 'var(--sev-critical)' }
    case 'resolved':   return { color: 'var(--accent)' }
    default:           return { color: 'var(--text-muted)' }
  }
}

function changeDotStyle(change: DimensionComparison['change']): React.CSSProperties {
  switch (change) {
    case 'improved':   return { background: 'var(--sev-minor)' }
    case 'regression': return { background: 'var(--sev-critical)' }
    case 'resolved':   return { background: 'var(--accent)' }
    default:           return { background: 'var(--text-muted)' }
  }
}

const CHANGE_LABEL: Record<DimensionComparison['change'], string> = {
  improved:   'Verbeterd',
  regression: 'Achteruitgang',
  neutral:    'Neutraal',
  resolved:   'Opgelost',
}

function scoreStyle(score: CompareResultData['overallScore']): React.CSSProperties {
  switch (score) {
    case 'better':  return { color: 'var(--sev-minor)',    borderColor: 'color-mix(in srgb, var(--sev-minor) 40%, transparent)' }
    case 'worse':   return { color: 'var(--sev-critical)', borderColor: 'color-mix(in srgb, var(--sev-critical) 40%, transparent)' }
    default:        return { color: 'var(--text-muted)',   borderColor: 'var(--border)' }
  }
}

const SCORE_LABEL: Record<NonNullable<CompareResultData['overallScore']>, string> = {
  better:  'Beter',
  worse:   'Slechter',
  similar: 'Vergelijkbaar',
}

export default function CompareResultView({ compareResult }: Props) {
  const { overallVerdict, overallScore, dimensionComparisons, resolvedIssues, newIssues, focusAnswer } = compareResult

  return (
    <div className="space-y-5 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Vergelijkingsresultaat</p>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--accent)' }}>V2</p>
      </div>

      {/* Overall verdict */}
      <div className="rounded-xl p-4 space-y-1"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{overallVerdict}</p>
        {overallScore && (
          <span className="inline-block text-xs px-2.5 py-0.5 rounded-full border"
            style={scoreStyle(overallScore)}>
            {SCORE_LABEL[overallScore]}
          </span>
        )}
      </div>

      {/* Focus answer */}
      {focusAnswer && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
            Antwoord op focusvraag
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{focusAnswer}</p>
        </div>
      )}

      {/* Dimension comparisons */}
      {dimensionComparisons && dimensionComparisons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Dimensies</p>
          {dimensionComparisons.map((dim, i) => (
            <div key={i} className="rounded-xl p-3.5 space-y-1"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{dim.dimension}</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={changeDotStyle(dim.change)} />
                  <span className="text-xs" style={changeStyle(dim.change)}>{CHANGE_LABEL[dim.change]}</span>
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{dim.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Resolved / new issues */}
      <div className="flex gap-3 flex-wrap">
        {resolvedIssues != null && resolvedIssues > 0 && (
          <span className="text-xs px-3 py-1 rounded-full border"
            style={{ color: 'var(--sev-minor)', background: 'color-mix(in srgb, var(--sev-minor) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--sev-minor) 25%, transparent)' }}>
            {resolvedIssues} opgelost
          </span>
        )}
        {newIssues != null && newIssues > 0 && (
          <span className="text-xs px-3 py-1 rounded-full border"
            style={{ color: 'var(--sev-important)', background: 'color-mix(in srgb, var(--sev-important) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--sev-important) 25%, transparent)' }}>
            {newIssues} nieuwe problemen
          </span>
        )}
      </div>
    </div>
  )
}
