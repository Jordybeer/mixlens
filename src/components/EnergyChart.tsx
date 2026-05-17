'use client'

import type { EnergyPoint, Section } from '@/types/analysis'
import { formatTime } from '@/lib/audioAnalysis'

interface Props {
  energyCurve: EnergyPoint[]
  sections: Section[]
  duration: number
}

export default function EnergyChart({ energyCurve, sections, duration }: Props) {
  if (!energyCurve.length) return null

  const W = 800
  const H = 60
  const maxRms = Math.max(...energyCurve.map((p) => p.rms), 0.001)

  const points = energyCurve
    .map((p) => {
      const x = (p.time / duration) * W
      const y = H - (p.rms / maxRms) * H
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="space-y-1">
      <p className="text-xs text-white/40 uppercase tracking-widest">Energy</p>
      <div className="relative bg-white/5 rounded-lg overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 60 }}>
          {/* Section bands */}
          {sections.map((s) => (
            <rect
              key={s.startSeconds}
              x={(s.startSeconds / duration) * W}
              y={0}
              width={((s.endSeconds - s.startSeconds) / duration) * W}
              height={H}
              fill="rgba(255,255,255,0.02)"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}
          {/* Energy fill */}
          <polyline
            points={`0,${H} ${points} ${W},${H}`}
            fill="rgba(79,152,163,0.2)"
            stroke="none"
          />
          {/* Energy line */}
          <polyline
            points={points}
            fill="none"
            stroke="#4f98a3"
            strokeWidth={1.5}
          />
        </svg>
        {/* Time labels */}
        <div className="flex justify-between px-2 pb-1">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="text-[10px] text-white/30 font-mono">
              {formatTime(t * duration)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
