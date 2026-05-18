'use client'

import { useEffect, useRef } from 'react'
import type { FFTBand } from '@/types/analysis'

// Key frequency markers for reference lines
const MARKERS = [
  { freq: 60,   label: '60' },
  { freq: 120,  label: '120' },
  { freq: 250,  label: '250' },
  { freq: 500,  label: '500' },
  { freq: 1000, label: '1k' },
  { freq: 2000, label: '2k' },
  { freq: 4000, label: '4k' },
  { freq: 8000, label: '8k' },
  { freq: 16000, label: '16k' },
]

const DB_MIN = -80
const DB_MAX = 0
const FREQ_MIN = 20
const FREQ_MAX = 20000

function freqToX(freq: number, width: number): number {
  const logMin = Math.log10(FREQ_MIN)
  const logMax = Math.log10(FREQ_MAX)
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width
}

function dbToY(db: number, height: number): number {
  return height - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * height
}

export default function SpectrumChart({ bands }: { bands: FFTBand[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || bands.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const PAD = { top: 12, right: 12, bottom: 28, left: 36 }
    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.roundRect(PAD.left, PAD.top, plotW, plotH, 8)
    ctx.fill()

    // dB grid lines
    const dbSteps = [-60, -48, -36, -24, -12, 0]
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.textAlign = 'right'
    for (const db of dbSteps) {
      const y = PAD.top + dbToY(db, plotH)
      ctx.beginPath()
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + plotW, y)
      ctx.stroke()
      ctx.fillText(`${db}`, PAD.left - 4, y + 3)
    }

    // Frequency marker lines
    ctx.textAlign = 'center'
    for (const m of MARKERS) {
      const x = PAD.left + freqToX(m.freq, plotW)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, PAD.top)
      ctx.lineTo(x, PAD.top + plotH)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillText(m.label, x, PAD.top + plotH + 16)
    }

    // Spectrum fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH)
    grad.addColorStop(0,   'rgba(79, 152, 163, 0.85)')
    grad.addColorStop(0.5, 'rgba(79, 152, 163, 0.4)')
    grad.addColorStop(1,   'rgba(79, 152, 163, 0.05)')

    ctx.beginPath()
    ctx.moveTo(PAD.left + freqToX(bands[0].freq, plotW), PAD.top + plotH)
    for (const band of bands) {
      const x = PAD.left + freqToX(band.freq, plotW)
      const y = PAD.top + dbToY(band.db, plotH)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(PAD.left + freqToX(bands[bands.length - 1].freq, plotW), PAD.top + plotH)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Spectrum line on top
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(79, 152, 163, 1)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < bands.length; i++) {
      const x = PAD.left + freqToX(bands[i].freq, plotW)
      const y = PAD.top + dbToY(bands[i].db, plotH)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Hz label bottom-left
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillText('Hz', PAD.left, PAD.top + plotH + 16)

  }, [bands])

  if (bands.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40 uppercase tracking-widest">Frequency Spectrum</p>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl"
        style={{ height: 180 }}
      />
    </div>
  )
}
