'use client'

import { useRef, useState } from 'react'
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
  const draggingRef = useRef<Handle>(null)
  const dragStartXRef = useRef(0)
  const dragStartRangeRef = useRef<[number, number]>([0, duration])
  const [, forceRender] = useState(0)

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

  function svgXFromClient(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, Math.min(W, ((clientX - rect.left) / rect.width) * W))
  }

  function toSeconds(x: number) { return (x / W) * duration }

  function startDrag(handle: Handle, e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    draggingRef.current = handle
    dragStartXRef.current = svgXFromClient(e.clientX)
    dragStartRangeRef.current = [cropStart, cropEnd]
    forceRender(n => n + 1)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const x = svgXFromClient(e.clientX)
    const dx = toSeconds(x - dragStartXRef.current)
    const [s0, e0] = dragStartRangeRef.current
    const minGap = Math.max(1, duration * 0.02)

    if (draggingRef.current === 'start') {
      const s = Math.max(0, Math.min(s0 + dx, e0 - minGap))
      onChange(s, cropEnd)
    } else if (draggingRef.current === 'end') {
      const end = Math.max(s0 + minGap, Math.min(e0 + dx, duration))
      onChange(cropStart, end)
    } else if (draggingRef.current === 'region') {
      const span = e0 - s0
      const newStart = Math.max(0, Math.min(s0 + dx, duration - span))
      onChange(newStart, newStart + span)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    draggingRef.current = null
    forceRender(n => n + 1)
  }

  const isDragging = draggingRef.current !== null
  const cropLabel = `${fmtTime(cropStart)} – ${fmtTime(cropEnd)} (${fmtTime(cropEnd - cropStart)})`
  const isFull = cropStart < 0.5 && cropEnd > duration - 0.5

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Regio bijsnijden</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{cropLabel}</span>
          {!isFull && (
            <button
              onClick={() => onChange(0, duration)}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-faint)' }}
            >
              reset
            </button>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg touch-none"
        style={{ height: 56, cursor: isDragging ? 'grabbing' : 'default' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Waveform shape */}
        <polyline points={`0,${H} ${points} ${W},${H}`} fill="rgba(79,152,163,0.08)" stroke="none" />
        <polyline points={points} fill="none" stroke="rgba(79,152,163,0.4)" strokeWidth="1" strokeLinejoin="round" />
        {/* Dim mask — uses CSS variable so it works in both themes */}
        <rect x={0} y={0} width={startX} height={H} fill="var(--overlay-dim)" />
        <rect x={endX} y={0} width={W - endX} height={H} fill="var(--overlay-dim)" />
        {/* Active region */}
        <rect
          x={startX} y={0} width={Math.max(0, endX - startX)} height={H}
          fill="rgba(79,152,163,0.08)"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={(e) => startDrag('region', e)}
        />
        {/* Start handle */}
        <rect x={startX - 8} y={0} width={16} height={H} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => startDrag('start', e)} />
        <rect x={startX - 2} y={0} width={4} height={H} fill="var(--accent)" rx={2} style={{ pointerEvents: 'none' }} />
        <text x={startX + 6} y={11} fill="var(--accent)" fontSize="7" fontFamily="monospace" style={{ pointerEvents: 'none' }}>{fmtTime(cropStart)}</text>
        {/* End handle */}
        <rect x={endX - 8} y={0} width={16} height={H} fill="transparent" style={{ cursor: 'ew-resize' }} onPointerDown={(e) => startDrag('end', e)} />
        <rect x={endX - 2} y={0} width={4} height={H} fill="var(--accent)" rx={2} style={{ pointerEvents: 'none' }} />
        <text x={endX - 32} y={11} fill="var(--accent)" fontSize="7" fontFamily="monospace" style={{ pointerEvents: 'none' }}>{fmtTime(cropEnd)}</text>
      </svg>

      {!isFull && (
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Alleen de geselecteerde regio wordt geanalyseerd.</p>
      )}
    </div>
  )
}
