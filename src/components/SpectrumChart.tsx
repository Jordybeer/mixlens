'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { FFTBand } from '@/types/analysis'

const MARKERS = [
  { freq: 60,    label: '60' },
  { freq: 120,   label: '120' },
  { freq: 250,   label: '250' },
  { freq: 500,   label: '500' },
  { freq: 1000,  label: '1k' },
  { freq: 2000,  label: '2k' },
  { freq: 4000,  label: '4k' },
  { freq: 8000,  label: '8k' },
  { freq: 16000, label: '16k' },
]

// Note fundamentals for key overlay (C2–C6)
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const KEY_ROOT_NOTES: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7,
  'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}
// Scale intervals: major + minor
const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  min:   [0, 2, 3, 5, 7, 8, 10],
  maj:   [0, 2, 4, 5, 7, 9, 11],
}

function getScaleFrequencies(keyString: string): number[] {
  // Parse e.g. "C major", "F# minor", "Am"
  const lower = keyString.toLowerCase().trim()
  let rootName = ''
  let scaleName = 'major'

  const matchFull = keyString.match(/^([A-G][b#]?)\s*(major|minor|maj|min)/i)
  if (matchFull) {
    rootName = matchFull[1]
    scaleName = matchFull[2].toLowerCase()
  } else {
    // Short form: Am, C#m, F
    const matchShort = keyString.match(/^([A-G][b#]?)(m)?$/i)
    if (matchShort) {
      rootName = matchShort[1]
      scaleName = matchShort[2] ? 'minor' : 'major'
    }
  }

  const rootMidi = KEY_ROOT_NOTES[rootName]
  if (rootMidi === undefined) return []
  const intervals = SCALE_INTERVALS[scaleName] ?? SCALE_INTERVALS.major

  const freqs: number[] = []
  // C2 = MIDI 36. Generate across octaves 2–6
  for (let oct = 2; oct <= 6; oct++) {
    const baseNote = 12 * (oct + 1) // MIDI note for C in this octave (C4=60)
    for (const interval of intervals) {
      const midi = baseNote + ((rootMidi + interval) % 12)
      const freq = 440 * Math.pow(2, (midi - 69) / 12)
      if (freq >= 30 && freq <= 18000) freqs.push(freq)
    }
  }
  return freqs
}

const DB_MIN = -80
const DB_MAX = 0
const FREQ_MIN = 20
const FREQ_MAX = 20000

function freqToX(freq: number, width: number): number {
  const logMin = Math.log10(FREQ_MIN)
  const logMax = Math.log10(FREQ_MAX)
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width
}

function xToFreq(x: number, width: number): number {
  const logMin = Math.log10(FREQ_MIN)
  const logMax = Math.log10(FREQ_MAX)
  return Math.pow(10, logMin + (x / width) * (logMax - logMin))
}

function dbToY(db: number, height: number): number {
  return height - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * height
}

function yToDb(y: number, height: number): number {
  return DB_MIN + ((height - y) / height) * (DB_MAX - DB_MIN)
}

function fmtFreq(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`
}

interface Props {
  bands: FFTBand[]
  musicalKey?: string | null
  showKeyScale?: boolean
}

export default function SpectrumChart({ bands, musicalKey, showKeyScale = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGSVGElement>(null)

  // Draggable label line state
  const [labelRatio, setLabelRatio] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)

  const [showScale, setShowScale] = useState(showKeyScale)

  const PAD = { top: 12, right: 12, bottom: 28, left: 36 }

  // Derive label freq + db from ratio
  function ratioToMetrics(ratio: number, w: number, h: number) {
    const plotW = w - PAD.left - PAD.right
    const plotH = h - PAD.top - PAD.bottom
    const freq = xToFreq(ratio * plotW, plotW)
    // Find nearest band db
    const nearest = bands.reduce((prev, b) =>
      Math.abs(b.freq - freq) < Math.abs(prev.freq - freq) ? b : prev, bands[0])
    const db = nearest?.db ?? -80
    return { freq, db, plotW, plotH }
  }

  function getSvgRatio(e: React.MouseEvent<SVGElement>): number | null {
    const el = overlayRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const ratio = (e.clientX - rect.left - PAD.left) / (rect.width - PAD.left - PAD.right)
    return Math.max(0, Math.min(1, ratio))
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
    const r = getSvgRatio(e)
    if (r == null) return
    setHoverRatio(r)
    if (dragging) setLabelRatio(r)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  function handleClick(e: React.MouseEvent<SVGElement>) {
    if (dragging) return
    const r = getSvgRatio(e)
    if (r != null) setLabelRatio(r)
  }

  // Draw the spectrum on canvas
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

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom

    ctx.clearRect(0, 0, W, H)

    // Read theme-aware tokens from CSS variables
    const style = getComputedStyle(document.documentElement)
    const chartBg       = style.getPropertyValue('--chart-bg').trim()       || 'rgba(128,128,128,0.04)'
    const chartGrid     = style.getPropertyValue('--chart-grid').trim()     || 'rgba(128,128,128,0.12)'
    const chartLabel    = style.getPropertyValue('--chart-label').trim()    || 'rgba(128,128,128,0.50)'
    const accentColor   = style.getPropertyValue('--accent').trim()         || 'var(--accent)'
    const sevImportant  = style.getPropertyValue('--sev-important').trim()  || 'oklch(75% 0.15 85)'

    // Background
    ctx.fillStyle = chartBg
    ctx.roundRect(PAD.left, PAD.top, plotW, plotH, 8)
    ctx.fill()

    // Key scale overlay bands
    if (showScale && musicalKey) {
      const scaleFreqs = getScaleFrequencies(musicalKey)
      ctx.fillStyle = `color-mix(in srgb, ${sevImportant} 6%, transparent)`
      for (const freq of scaleFreqs) {
        const x = PAD.left + freqToX(freq, plotW)
        // Draw a thin band around each scale note
        const loFreq = freq * 0.97
        const hiFreq = freq * 1.03
        const x0 = PAD.left + freqToX(Math.max(FREQ_MIN, loFreq), plotW)
        const x1 = PAD.left + freqToX(Math.min(FREQ_MAX, hiFreq), plotW)
        ctx.fillRect(x0, PAD.top, Math.max(1.5, x1 - x0), plotH)
        // Root note gets a brighter mark
        const rootFreq = 440 * Math.pow(2, (KEY_ROOT_NOTES[musicalKey.split(' ')[0]] ?? 0 - 69) / 12)
        const isRoot = Math.abs(freq - rootFreq) < 5
        if (isRoot) {
          ctx.strokeStyle = `color-mix(in srgb, ${sevImportant} 30%, transparent)`
          ctx.lineWidth = 1
          ctx.setLineDash([3, 4])
          ctx.beginPath()
          ctx.moveTo(x, PAD.top)
          ctx.lineTo(x, PAD.top + plotH)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    // dB grid lines
    const dbSteps = [-60, -48, -36, -24, -12, 0]
    ctx.strokeStyle = chartGrid
    ctx.lineWidth = 1
    ctx.font = '10px monospace'
    ctx.fillStyle = chartLabel
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
      ctx.strokeStyle = chartGrid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, PAD.top)
      ctx.lineTo(x, PAD.top + plotH)
      ctx.stroke()
      ctx.fillStyle = chartLabel
      ctx.fillText(m.label, x, PAD.top + plotH + 16)
    }

    // Spectrum fill — use accent colour parsed from CSS var
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH)
    grad.addColorStop(0,   accentColor + 'cc') // ~80% opacity
    grad.addColorStop(0.5, accentColor + '66') // ~40% opacity
    grad.addColorStop(1,   accentColor + '0d') // ~5% opacity

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

    // Spectrum line
    ctx.beginPath()
    ctx.strokeStyle = accentColor
    ctx.lineWidth = 1.5
    for (let i = 0; i < bands.length; i++) {
      const x = PAD.left + freqToX(bands[i].freq, plotW)
      const y = PAD.top + dbToY(bands[i].db, plotH)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.fillStyle = chartLabel
    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillText('Hz', PAD.left, PAD.top + plotH + 16)
  }, [bands, musicalKey, showScale])

  if (bands.length === 0) return null

  // SVG overlay for draggable line — same bounding box as canvas
  const canvasEl = canvasRef.current
  const cW = canvasEl?.offsetWidth ?? 600
  const cH = canvasEl?.offsetHeight ?? 180
  const plotW = cW - PAD.left - PAD.right
  const plotH = cH - PAD.top - PAD.bottom

  const labelPx = labelRatio != null ? PAD.left + labelRatio * plotW : null
  const hoverPx = hoverRatio != null ? PAD.left + hoverRatio * plotW : null

  const labelMeta = labelRatio != null
    ? ratioToMetrics(labelRatio, cW, cH)
    : null
  const hoverMeta = hoverRatio != null
    ? ratioToMetrics(hoverRatio, cW, cH)
    : null

  const tooltipX = labelPx != null
    ? (labelPx + 70 > cW ? labelPx - 72 : labelPx + 4)
    : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Frequentiespectrum</p>
        <div className="flex items-center gap-3">
          {hoverMeta && (
            <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
              {fmtFreq(hoverMeta.freq)} / {hoverMeta.db} dB
            </span>
          )}
          {musicalKey && (
            <button
              onClick={() => setShowScale((v) => !v)}
              className="text-xs px-2 py-0.5 rounded transition-colors border"
              style={showScale
                ? { borderColor: 'color-mix(in srgb, var(--sev-important) 40%, transparent)', color: 'var(--sev-important)', background: 'color-mix(in srgb, var(--sev-important) 10%, transparent)' }
                : { borderColor: 'var(--border)', color: 'var(--text-faint)' }
              }
            >
              {musicalKey} toonladder
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="w-full rounded-xl block" style={{ height: 180 }} />

        {/* SVG overlay for interactivity */}
        <svg
          ref={overlayRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          viewBox={`0 0 ${cW} ${cH}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHoverRatio(null); setDragging(false) }}
          onMouseDown={(e) => {
            if (labelPx != null) {
              const r = getSvgRatio(e)
              if (r != null && Math.abs(r * plotW + PAD.left - labelPx) < 12) setDragging(true)
            }
          }}
          onMouseUp={() => setDragging(false)}
          onClick={handleClick}
        >
          {/* Hover crosshair */}
          {hoverPx != null && !dragging && (
            <line x1={hoverPx} x2={hoverPx} y1={PAD.top} y2={PAD.top + plotH}
              stroke="var(--chart-crosshair)" strokeWidth="1" />
          )}

          {/* Draggable label line */}
          {labelPx != null && (
            <g style={{ cursor: dragging ? 'grabbing' : 'grab' }}>
              <line x1={labelPx} x2={labelPx} y1={PAD.top} y2={PAD.top + plotH}
                stroke="var(--sev-important)" strokeWidth="1.5"
                strokeDasharray={dragging ? '4,3' : 'none'} />
              {/* Grab handle */}
              <circle cx={labelPx} cy={PAD.top + 6} r={5} fill="var(--sev-important)" opacity={0.9} />
              {/* Tooltip */}
              {labelMeta && (
                <>
                  <rect x={tooltipX} y={PAD.top + plotH - 20} width={68} height={14} rx={3} fill="var(--bg-panel)" opacity="0.92" />
                  <text x={tooltipX + 4} y={PAD.top + plotH - 9}
                    fill="var(--sev-important)" fontSize="7" fontFamily="monospace">
                    {fmtFreq(labelMeta.freq)} / {labelMeta.db} dB
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
