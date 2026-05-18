'use client'

import { useRef, useEffect, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { EnergyPoint, Section } from '@/types/analysis'

const SECTION_COLORS: string[] = [
  'rgba(79,152,163,0.15)',
  'rgba(232,175,52,0.12)',
  'rgba(109,170,69,0.12)',
  'rgba(209,99,167,0.10)',
  'rgba(221,105,116,0.10)',
]

const SECTION_LABEL_COLORS: string[] = [
  'rgba(79,152,163,0.7)',
  'rgba(232,175,52,0.7)',
  'rgba(109,170,69,0.7)',
  'rgba(209,99,167,0.7)',
  'rgba(221,105,116,0.7)',
]

function drawChart(
  canvas: HTMLCanvasElement,
  energy: EnergyPoint[],
  sections: Section[],
  currentTime: number,
  duration: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  ctx.clearRect(0, 0, W, H)

  if (!energy.length) return
  const maxRms = Math.max(...energy.map((p) => p.rms), 0.001)

  const tx = (t: number) => (t / duration) * W
  const ty = (rms: number) => H - (rms / maxRms) * H * 0.9 - H * 0.05

  // Section bands
  sections.forEach((sec, i) => {
    const x1 = tx(sec.startTime)
    const x2 = tx(sec.endTime ?? duration)
    ctx.fillStyle = SECTION_COLORS[i % SECTION_COLORS.length]
    ctx.fillRect(x1, 0, x2 - x1, H)
  })

  // Energy fill
  ctx.beginPath()
  ctx.moveTo(tx(energy[0].time), H)
  energy.forEach((p) => ctx.lineTo(tx(p.time), ty(p.rms)))
  ctx.lineTo(tx(energy[energy.length - 1].time), H)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(79,152,163,0.35)')
  grad.addColorStop(1, 'rgba(79,152,163,0.05)')
  ctx.fillStyle = grad
  ctx.fill()

  // Energy line
  ctx.beginPath()
  energy.forEach((p, i) => {
    if (i === 0) ctx.moveTo(tx(p.time), ty(p.rms))
    else ctx.lineTo(tx(p.time), ty(p.rms))
  })
  ctx.strokeStyle = 'rgba(79,152,163,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Section labels
  sections.forEach((sec, i) => {
    const x1 = tx(sec.startTime)
    ctx.fillStyle = SECTION_LABEL_COLORS[i % SECTION_LABEL_COLORS.length]
    ctx.font = '10px monospace'
    ctx.fillText(sec.label, x1 + 4, 12)
  })

  // Playhead
  if (currentTime > 0) {
    const px = tx(currentTime)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, H)
    ctx.stroke()
  }
}

export default function EnergyChart() {
  const { result, seekTo: storeSeekTo, setSeekTo } = useAnalysisStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const energy = result?.energyCurve ?? []
  const sections = result?.sections ?? []
  const duration = result?.durationSeconds ?? 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    const ctx = canvas.getContext('2d')
    ctx?.scale(dpr, dpr)
    drawChart(canvas, energy, sections, currentTime, duration)
  }, [energy, sections, currentTime, duration])

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = ((e.clientX - rect.left) / rect.width) * duration
    setSeekTo(t)
    setCurrentTime(t)
  }

  if (!result || !energy.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40 uppercase tracking-widest">Energy</p>
        {currentTime > 0 && (
          <button
            onClick={() => { setCurrentTime(0); setSeekTo(0) }}
            className="text-xs px-2.5 py-1 rounded-md border border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          >
            Reset playhead
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full rounded-lg cursor-pointer"
        style={{ height: 80 }}
      />
    </div>
  )
}
