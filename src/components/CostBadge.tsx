'use client'

import type { CostEstimate } from '@/types/analysis'

interface Props {
  cost: CostEstimate
}

function fmt(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  return `$${usd.toFixed(4)}`
}

export default function CostBadge({ cost }: Props) {
  return (
    <div
      title={`${cost.model} · ${cost.inputTokens.toLocaleString()} in / ${cost.outputTokens.toLocaleString()} out · LLM ${fmt(cost.llmCostUsd)} + infra ${fmt(cost.infraCostUsd)}`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/10 bg-white/5 cursor-default select-none"
    >
      {/* token icon */}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-40">
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3.5 5h3M5 3.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      <span className="text-[11px] font-mono text-white/35">
        {fmt(cost.totalCostUsd)}
      </span>
      <span className="text-[10px] text-white/20">
        {(cost.inputTokens + cost.outputTokens).toLocaleString()}t
      </span>
    </div>
  )
}
