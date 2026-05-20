'use client'

import { useRef, useEffect, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { EnergyPoint, Section } from '@/types/analysis'

function getChartColors() {
  const s = getComputedStyle(document.documentElement)
  const g = (v: string) => s.getPropertyValue(v).trim()
  return {
    sectionFills:   [0,1,2,3,4].map(i => g(`--chart-section-${i}-fill`)),
    sectionPills:   [0,1,2,3,4].map(i => g(`--chart-section-${i}-pill`)),
    sectionStrokes: [0,1,2,3,4].map(i => g(`--chart-section-${i}-stroke`)),
    energyFillTop:  g('--chart-energy-fill-top'),
    energyFillBot:  g('--chart-energy-fill-bot'),
    energyLine:     g('--chart-energy-line'),
  }
}

function drawChart(
  canvas: HTMLCanvasElement,
  energy: EnergyPoint[],
  sections: Section[],
  currentTime: number,
  duration: number,
  playheadColor = 'rgba(255,255,255,0.4)',
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  ctx.clearRect(0, 0, W, H)

  if (!energy.length) return
  const colors = getChartColors()
  const maxRms = Math.max(...energy.map((p) => p.rms), 0.001)

  const tx = (t: number) => (t / duration) * W
  const ty = (rms: number) => H - (rms / maxRms) * H * 0.9 - H * 0.05

  // Section bands
  sections.forEach((sec, i) => {
    const x1 = tx(sec.startSeconds)
    const x2 = tx(sec.endSeconds ?? duration)
    ctx.fillStyle = colors.sectionFills[i % 5]
    ctx.fillRect(x1, 0, x2 - x1, H)
  })

  // Energy fill
  ctx.beginPath()
  ctx.moveTo(tx(energy[0].time), H)
  energy.forEach((p) => ctx.lineTo(tx(p.time), ty(p.rms)))
  ctx.lineTo(tx(energy[energy.length - 1].time), H)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, colors.energyFillTop)
  grad.addColorStop(1, colors.energyFillBot)
  ctx.fillStyle = grad
  ctx.fill()

  // Energy line
  ctx.beginPath()
  energy.forEach((p, i) => {
    if (i === 0) ctx.moveTo(tx(p.time), ty(p.rms))
    else ctx.lineTo(tx(p.time), ty(p.rms))
  })
  ctx.strokeStyle = colors.energyLine
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Section boundary lines + labels
  sections.forEach((sec, i) => {
    const x1 = tx(sec.startSeconds)
    const stroke = colors.sectionStrokes[i % 5]

    // Vertical boundary line (skip first section — no line at 0)
    if (sec.startSeconds > 0) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x1, 0)
      ctx.lineTo(x1, H)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Label pill background
    ctx.font = 'bold 9px monospace'
    const textW = ctx.measureText(sec.label).width
    ctx.fillStyle = colors.sectionPills[i % 5]
    ctx.beginPath()
    ctx.roundRect(x1 + 4, 3, textW + 8, 14, 3)
    ctx.fill()

    // Label text
    ctx.fillStyle = stroke
    ctx.fillText(sec.label, x1 + 8, 13)
  })

  // Playhead
  if (currentTime > 0) {
    const px = tx(currentTime)
    ctx.strokeStyle = playheadColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, H)
    ctx.stroke()
  }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function EnergyChart() {
  const { result, seekTo: storeSeekTo, setSeekTo, setUserSections } = useAnalysisStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  const energy = result?.energyCurve ?? []
  const sections = result?.sections ?? []
  const duration = result?.durationSeconds ?? 1

  void storeSeekTo
  void animRef
  void audioRef

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    const ctx = canvas.getContext('2d')
    ctx?.scale(dpr, dpr)
    const playheadColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--chart-playhead').trim() || 'rgba(255,255,255,0.4)'
    drawChart(canvas, energy, sections, currentTime, duration, playheadColor)
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
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Energie</p>
        {currentTime > 0 && (
          <button
            onClick={() => { setCurrentTime(0); setSeekTo(0) }}
            className="text-xs px-2.5 py-1 rounded-md border transition-colors"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}
          >
            Positie resetten
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full rounded-lg cursor-pointer"
        style={{ height: 80 }}
      />

      {sections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sections.map((sec, i) => (
            <button
              key={`${sec.label}-${i}`}
              onClick={() => { setSeekTo(sec.startSeconds); setCurrentTime(sec.startSeconds) }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-opacity hover:opacity-80"
              style={{
                borderColor: `var(--chart-section-${i % 5}-stroke)`,
                color: `var(--chart-section-${i % 5}-stroke)`,
                background: `var(--chart-section-${i % 5}-fill)`,
              }}
            >
              <span className="font-mono" style={{ color: 'var(--text-faint)', fontSize: 10 }}>{fmtTime(sec.startSeconds)}</span>
              <span>{sec.label}</span>
              {sections.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const updated = sections.filter((_, j) => j !== i)
                    const dur = result?.durationSeconds ?? 0
                    const recalc = updated.map((s, j) => ({
                      ...s,
                      endSeconds: updated[j + 1]?.startSeconds ?? dur,
                    }))
                    setUserSections(recalc)
                  }}
                  className="opacity-50 hover:opacity-100 transition-opacity leading-none"
                  style={{ fontSize: 11 }}
                >×</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
