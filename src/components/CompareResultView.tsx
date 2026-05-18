'use client'

import type { CompareResult, CompareItem, DiffTag } from '@/types/analysis'

const TAG_META: Record<DiffTag, { label: string; color: string; dot: string }> = {
  improved:   { label: 'Improved',   color: 'text-[#6daa45]',  dot: 'bg-[#6daa45]' },
  regression: { label: 'Regression', color: 'text-[#dd6974]',  dot: 'bg-[#dd6974]' },
  new_issue:  { label: 'New issue',  color: 'text-[#fdab43]',  dot: 'bg-[#fdab43]' },
  resolved:   { label: 'Resolved',   color: 'text-[#4f98a3]',  dot: 'bg-[#4f98a3]' },
  unchanged:  { label: 'Unchanged',  color: 'text-white/40',   dot: 'bg-white/20'  },
}

const VERDICT_STYLE: Record<CompareResult['overallVerdict'], string> = {
  better:  'border-[#6daa45]/40 text-[#6daa45]',
  worse:   'border-[#dd6974]/40 text-[#dd6974]',
  mixed:   'border-[#fdab43]/40 text-[#fdab43]',
  neutral: 'border-white/20 text-white/50',
}

const VERDICT_ICON: Record<CompareResult['overallVerdict'], string> = {
  better: '↑', worse: '↓', mixed: '↕', neutral: '→',
}

function CompareItemCard({ item }: { item: CompareItem }) {
  const meta = TAG_META[item.tag]
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        <span className="text-sm font-medium text-white">{item.area}</span>
        <span className={`ml-auto text-xs font-medium uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white/5 rounded-lg p-3 space-y-1">
          <p className="text-white/30 uppercase tracking-widest text-[10px]">V1</p>
          <p className="text-white/70 leading-relaxed">{item.v1}</p>
        </div>
        <div className="bg-white/5 rounded-lg p-3 space-y-1">
          <p className="text-[#4f98a3] uppercase tracking-widest text-[10px]">V2</p>
          <p className="text-white/70 leading-relaxed">{item.v2}</p>
        </div>
      </div>
      <p className="text-xs text-white/50 leading-relaxed border-t border-white/10 pt-3">{item.verdict}</p>
    </div>
  )
}

export default function CompareResultView({
  result,
  v1Name,
  v2Name,
}: {
  result: CompareResult
  v1Name: string
  v2Name: string
}) {
  const improved   = result.items.filter((i) => i.tag === 'improved' || i.tag === 'resolved')
  const regressions = result.items.filter((i) => i.tag === 'regression' || i.tag === 'new_issue')
  const unchanged  = result.items.filter((i) => i.tag === 'unchanged')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${VERDICT_STYLE[result.overallVerdict]}`}>
        <span className="text-2xl font-bold">{VERDICT_ICON[result.overallVerdict]}</span>
        <div>
          <p className="text-xs uppercase tracking-widest opacity-60 mb-0.5">Overall verdict</p>
          <p className="text-sm font-medium capitalize">{result.overallVerdict}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Summary</p>
        <p className="text-sm text-white/80 leading-relaxed">{result.summary}</p>
      </div>

      {/* File names */}
      <div className="flex gap-3 text-xs text-white/30">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/20" />{v1Name}</span>
        <span className="text-white/15">→</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#4f98a3]" />{v2Name}</span>
      </div>

      {/* Stat pills */}
      <div className="flex gap-2 flex-wrap">
        {improved.length > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-[#6daa45]/10 text-[#6daa45] border border-[#6daa45]/20">
            ✓ {improved.length} improved
          </span>
        )}
        {regressions.length > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-[#dd6974]/10 text-[#dd6974] border border-[#dd6974]/20">
            ✗ {regressions.length} regression{regressions.length > 1 ? 's' : ''}
          </span>
        )}
        {unchanged.length > 0 && (
          <span className="text-xs px-3 py-1 rounded-full bg-white/5 text-white/30 border border-white/10">
            — {unchanged.length} unchanged
          </span>
        )}
      </div>

      {/* Items */}
      {regressions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-white/30 uppercase tracking-widest">Needs attention</p>
          {regressions.map((item) => <CompareItemCard key={item.id} item={item} />)}
        </div>
      )}

      {improved.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-white/30 uppercase tracking-widest">What improved</p>
          {improved.map((item) => <CompareItemCard key={item.id} item={item} />)}
        </div>
      )}

      {unchanged.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-white/30 uppercase tracking-widest">Unchanged</p>
          {unchanged.map((item) => <CompareItemCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
