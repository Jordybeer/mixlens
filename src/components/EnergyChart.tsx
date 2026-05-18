'use client'

import { useRef, useState } from 'react'
import type { EnergyPoint, Section } from '@/types/analysis'

interface Props {
  energyCurve: EnergyPoint[]
  sections: Section[]
  duration: number
  onSeek?: (seconds: number) => void
}

export default function EnergyChart({ energyCurve, sections, duration, onSeek }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  if (!energyCurve.length) return null

  const W = 600
  const H = 80
  const maxRms = Math.max(...energyCurve.map((p) => p.rms), 0.001)

  const points = energyCurve
    .map((p) => {
      const x = (p.time / duration) * W
      const y = H - (p.rms / maxRms) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  function getSvgX(e: React.MouseEvent<SVGSVGElement>): { x: number; t: number } | null {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return { x: ratio * W, t: Math.round(ratio * duration) }
  }

  function fmtTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-white/30 uppercase tracking-widest">
        Energy
        {onSeek && <span className="text-white/15 normal-case tracking-normal ml-2">— click to stamp a timestamp</span>}
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full h-16 ${onSeek ? 'cursor-crosshair' : ''}`}
        onMouseMove={(e) => {
          if (!onSeek) return
          const pos = getSvgX(e)
          if (pos) { setHoverX(pos.x); setHoverTime(pos.t) }
        }}
        onMouseLeave={() => { setHoverX(null); setHoverTime(null) }}
        onClick={(e) => {
          if (!onSeek) return
          const pos = getSvgX(e)
          if (pos) onSeek(pos.t)
        }}
      >
        {/* Section bands */}
        {sections.map((s, i) => (
          <rect
            key={i}
            x={(s.startSeconds / duration) * W}
            y={0}
            width={Math.max(1, ((s.endSeconds - s.startSeconds) / duration) * W)}
            height={H}
            fill={i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)'}
          />
        ))}

        {/* Fill */}
        <polyline
          points={`0,${H} ${points} ${W},${H}`}
          fill="rgba(79,152,163,0.12)"
          stroke="none"
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#4f98a3"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Section markers */}
        {sections.slice(1).map((s, i) => (
          <line
            key={i}
            x1={(s.startSeconds / duration) * W}
            x2={(s.startSeconds / duration) * W}
            y1={0} y2={H}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        ))}

        {/* Section labels */}
        {sections.map((s, i) => (
          <text
            key={i}
            x={(s.startSeconds / duration) * W + 4}
            y={11}
            fill="rgba(255,255,255,0.3)"
            fontSize="7"
            fontFamily="monospace"
          >
            {s.label}
          </text>
        ))}

        {/* Hover scrubber */}
        {hoverX != null && (
          <>
            <line
              x1={hoverX} x2={hoverX}
              y1={0} y2={H}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <rect
              x={Math.min(hoverX + 4, W - 36)}
              y={H - 18}
              width={32} height={14}
              rx={3}
              fill="rgba(0,0,0,0.6)"
            />
            <text
              x={Math.min(hoverX + 8, W - 32)}
              y={H - 7}
              fill="rgba(255,255,255,0.7)"
              fontSize="7"
              fontFamily="monospace"
            >
              {hoverTime != null ? fmtTime(hoverTime) : ''}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}
