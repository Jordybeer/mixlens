'use client'

import { useRef, useState, useCallback } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { EnergyPoint, Section } from '@/types/analysis'

interface Props {
  energyCurve: EnergyPoint[]
  sections: Section[]
  duration: number
  bpm?: number | null
  onSeek?: (seconds: number) => void
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function EnergyChart({ energyCurve, sections, duration, bpm, onSeek }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const audioTime = useAnalysisStore((s) => s.audioTime)

  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  const [labelX, setLabelX] = useState<number | null>(null)
  const [labelTime, setLabelTime] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(false)

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

  // Live playhead X position
  const playheadX = duration > 0 ? (audioTime / duration) * W : null

  function getSvgPos(e: React.MouseEvent<SVGSVGElement>): { x: number; t: number } | null {
    if (!svgRef.current) return null
    const rect = svgRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return { x: ratio * W, t: ratio * duration }
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getSvgPos(e)
    if (!pos) return
    setHoverX(pos.x)
    setHoverTime(pos.t)
    if (dragRef.current) {
      setLabelX(pos.x)
      setLabelTime(pos.t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration])

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (labelX == null) return
    const pos = getSvgPos(e)
    if (pos && Math.abs(pos.x - labelX) < 12) {
      dragRef.current = true
      setDragging(true)
    }
  }

  function handleMouseUp() {
    dragRef.current = false
    setDragging(false)
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (dragRef.current) return
    const pos = getSvgPos(e)
    if (!pos) return
    setLabelX(pos.x)
    setLabelTime(pos.t)
  }

  const beatLines: number[] = []
  if (bpm && bpm > 0 && duration > 0) {
    const barInterval = (60 / bpm) * 4
    for (let t = 0; t < duration; t += barInterval) {
      beatLines.push((t / duration) * W)
    }
  }

  const labelTooltipX = labelX != null ? Math.min(labelX + 4, W - 52) : 0

  if (!energyCurve.length) return null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-white/40 uppercase tracking-widest shrink-0">
          Energy
          {bpm && <span className="text-white/20 normal-case tracking-normal ml-2 font-mono">{bpm} BPM</span>}
        </p>
        <div className="flex items-center gap-2">
          {/* Show live playhead time when playing, else hover time */}
          {(audioTime > 0 || hoverTime != null) && (
            <span className="text-xs font-mono text-white/30">
              {audioTime > 0 ? fmtTime(audioTime) : fmtTime(hoverTime!)}
            </span>
          )}
          {onSeek && (
            <button
              onClick={() => { if (hoverTime != null) onSeek(Math.round(hoverTime)) }}
              disabled={hoverTime == null}
              className="text-xs px-2.5 py-1 rounded-md border border-[#4f98a3]/40 text-[#4f98a3] hover:bg-[#4f98a3]/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors font-mono"
            >
              + Stamp
            </button>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-16 select-none"
        style={{ cursor: dragging ? 'grabbing' : (labelX != null && hoverX != null && Math.abs(hoverX - labelX) < 12 ? 'grab' : 'crosshair') }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverX(null); setHoverTime(null); handleMouseUp() }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      >
        {/* Section bands */}
        {sections.map((s, i) => (
          <rect key={i}
            x={(s.startSeconds / duration) * W} y={0}
            width={Math.max(1, ((s.endSeconds - s.startSeconds) / duration) * W)} height={H}
            fill={i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)'} />
        ))}

        {/* BPM bar grid */}
        {beatLines.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={0} y2={H}
            stroke="rgba(255,200,80,0.08)" strokeWidth="1" strokeDasharray="2,4" />
        ))}
        {beatLines.slice(0, 64).map((x, i) => (
          i % 4 === 0 ? (
            <text key={i} x={x + 2} y={H - 2} fill="rgba(255,200,80,0.25)" fontSize="6" fontFamily="monospace">
              {i / 4 + 1}
            </text>
          ) : null
        ))}

        {/* Fill + line */}
        <polyline points={`0,${H} ${points} ${W},${H}`} fill="rgba(79,152,163,0.12)" stroke="none" />
        <polyline points={points} fill="none" stroke="#4f98a3" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Section dividers + labels */}
        {sections.slice(1).map((s, i) => (
          <line key={i}
            x1={(s.startSeconds / duration) * W} x2={(s.startSeconds / duration) * W}
            y1={0} y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
        ))}
        {sections.map((s, i) => (
          <text key={i} x={(s.startSeconds / duration) * W + 4} y={11}
            fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="monospace">
            {s.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hoverX != null && (
          <line x1={hoverX} x2={hoverX} y1={0} y2={H}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="2,3" />
        )}

        {/* Draggable yellow label line */}
        {labelX != null && (
          <g>
            <line x1={labelX} x2={labelX} y1={0} y2={H}
              stroke="#fbbf24" strokeWidth="1.5"
              strokeDasharray={dragging ? '4,3' : 'none'} />
            <circle cx={labelX} cy={6} r={5} fill="#fbbf24" opacity={0.9} />
            <rect x={labelTooltipX} y={H - 20} width={44} height={14} rx={3} fill="rgba(0,0,0,0.75)" />
            <text x={labelTooltipX + 4} y={H - 9} fill="#fbbf24" fontSize="7" fontFamily="monospace">
              {labelTime != null ? fmtTime(labelTime) : ''}
            </text>
          </g>
        )}

        {/* Live teal playhead */}
        {playheadX != null && playheadX > 0 && (
          <g>
            <line
              x1={playheadX} x2={playheadX} y1={0} y2={H}
              stroke="#4f98a3" strokeWidth="1.5" opacity={0.9}
            />
            <polygon
              points={`${playheadX - 4},0 ${playheadX + 4},0 ${playheadX},7`}
              fill="#4f98a3"
            />
          </g>
        )}
      </svg>
    </div>
  )
}
