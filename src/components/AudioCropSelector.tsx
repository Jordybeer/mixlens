'use client'

import { useRef, useState, useEffect } from 'react'
import type { EnergyPoint } from '@/types/analysis'

interface Props {
  duration: number
  energyCurve: EnergyPoint[]
  cropStart: number
  cropEnd: number
  onChange: (start: number, end: number) => void
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

type Handle = 'start' | 'end' | 'region' | null

export default function AudioCropSelector({ duration, energyCurve, cropStart, cropEnd, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<Handle>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartRange, setDragStartRange] = useState<[number, number]>([0, duration])

  const W = 600
  const H = 48
  const maxRms = Math.max(...energyCurve.map((p) => p.rms), 0.001)

  const points = energyCurve
    .map((p) => {
      const x = (p.time / duration) * W
      const y = H - (p.rms / maxRms) * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const startX = (cropStart / duration) * W
  const endX = (cropEnd / duration) * W

  function svgX(e: React.MouseEvent): number {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(W, ((e.clientX - rect.left) / rect.width) * W))
  }

  function toSeconds(x: number) { return (x / W) * duration }

  function startDrag(handle: Handle, e: React.MouseEvent) {
    e.stopPropagation()
    setDragging(handle)
    setDragStartX(svgX(e))
    setDragStartRange([cropStart, cropEnd])
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    const x = svgX(e)
    const dx = toSeconds(x - dragStartX)
    const minGap = Math.max(1, duration * 0.05)
    if (dragging === 'start') {
      const s = Math.max(0, Math.min(dragStartRange[0] + dx, dragStartRange[1] - minGap))
      onChange(s, cropEnd)
    } else if (dragging === 'end') {
      const end = Math.max(dragStartRange[0] + minGap, Math.min(dragStartRange[1] + dx, duration))
      onChange(cropStart, end)
    } else if (dragging === 'region') {
      const span = dragStartRange[1] - dragStartRange[0]
      const newStart = Math.max(0, Math.min(dragStartRange[0] + dx, duration - span))
      onChange(newStart, newStart + span)
    }
  }

  const cropLabel = `${fmtTime(cropStart)} – ${fmtTime(cropEnd)} (${fmtTime(cropEnd - cropStart)})`
  const isFull = cropStart < 0.5 && cropEnd > duration - 0.5

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 uppercase tracking-widest">Crop Region</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#4f98a3]">{cropLabel}</span>
          {!isFull && (
            <button
              onClick={() => onChange(0, duration)}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              reset
            </button>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg overflow-visible"
        style={{ height: 48, cursor: dragging === 'region' ? 'grabbing' : 'default' }}
        onMouseMove={onMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        {/* Background energy waveform */}
        <polyline points={`0,${H} ${points} ${W},${H}`} fill="rgba(79,152,163,0.08)" stroke="none" />
        <polyline points={points} fill="none" stroke="rgba(79,152,163,0.4)" strokeWidth="1" strokeLinejoin="round" />

        {/* Dimmed regions outside crop */}
        <rect x={0} y={0} width={startX} height={H} fill="rgba(0,0,0,0.5)" />
        <rect x={endX} y={0} width={W - endX} height={H} fill="rgba(0,0,0,0.5)" />

        {/* Active crop region — draggable */}
        <rect
          x={startX} y={0} width={endX - startX} height={H}
          fill="rgba(79,152,163,0.08)"
          stroke="rgba(79,152,163,0.2)" strokeWidth="0"
          style={{ cursor: dragging === 'region' ? 'grabbing' : 'grab' }}
          onMouseDown={(e) => startDrag('region', e)}
        />

        {/* Start handle */}
        <rect
          x={startX - 3} y={0} width={6} height={H}
          fill="#4f98a3" rx={2}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => startDrag('start', e)}
        />
        <text x={startX + 4} y={10} fill="rgba(79,152,163,0.8)" fontSize="7" fontFamily="monospace">
          {fmtTime(cropStart)}
        </text>

        {/* End handle */}
        <rect
          x={endX - 3} y={0} width={6} height={H}
          fill="#4f98a3" rx={2}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => startDrag('end', e)}
        />
        <text x={endX - 30} y={10} fill="rgba(79,152,163,0.8)" fontSize="7" fontFamily="monospace">
          {fmtTime(cropEnd)}
        </text>
      </svg>

      {!isFull && (
        <p className="text-xs text-white/20">
          ⚠️ Only the selected region will be analysed — FFT and energy will reflect this crop.
        </p>
      )}
    </div>
  )
}
