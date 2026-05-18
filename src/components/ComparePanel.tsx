'use client'

import { useState } from 'react'
import { extractEnergyCurve, detectSections, extractSpectral, extractFFTSpectrum } from '@/lib/audioAnalysis'
import type { CompareResult, FFTBand, EnergyPoint, Section } from '@/types/analysis'
import CompareResultView from './CompareResultView'

const TOOLS: { label: string; icon: string; question: string; color: string }[] = [
  { label: 'Low End', icon: '🔉', color: 'border-[#4f98a3]/40', question: 'Focus on the low end: sub and kick relationship, mud between 100–250 Hz, bass translation on small speakers, low-end masking.' },
  { label: 'Mix Balance', icon: '⚖️', color: 'border-white/15', question: 'Analyse overall mix balance: levels, cluttered mids, anything sticking out unnaturally, frequency masking.' },
  { label: 'Arrangement', icon: '🎬', color: 'border-white/15', question: 'Review arrangement: transitions, variation, intro/outro, drops and builds, stagnant energy.' },
  { label: 'Tension & Energy', icon: '⚡', color: 'border-[#e8af34]/30', question: 'Evaluate tension and energy flow: does energy build before drops, flat moments, momentum loss.' },
  { label: 'Stereo Width', icon: '⇔', color: 'border-white/15', question: 'Assess stereo field: width vs mono compatibility, overly wide elements, phasing, centred low end.' },
  { label: 'Vocals / Lead', icon: '🎤', color: 'border-[#d163a7]/30', question: 'Focus on lead/vocals: buried or too forward, 2–5 kHz harshness, reverb/delay tail clarity, small-speaker cut.' },
  { label: 'Master Check', icon: '🎚️', color: 'border-[#6daa45]/30', question: 'Mastering readiness: headroom (target −6 dBFS peak), dynamic range, clipping/distortion artefacts, loudness vs commercial references.' },
  { label: 'Next Steps', icon: '📈', color: 'border-[#4f98a3]/40', question: 'What are the 3–5 most impactful next steps to improve this track? Rank by priority. Be specific with timestamps and frequency ranges.' },
]

interface TrackSnapshot {
  label: string
  fileName: string
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  spectral: { avgCentroid: number; avgRolloff: number; avgFlux: number; dynamicRange: number } | null
  fftBands: FFTBand[]
}

const ACCEPT = '.wav,.mp3,.aif,.aiff,.flac,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/aiff,audio/x-aiff,audio/flac,audio/ogg'
const MAX_MB = 80

async function extractSnapshot(file: File, label: string): Promise<TrackSnapshot> {
  const arrayBuffer = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  const [energyCurve, spectral, fftBands] = await Promise.all([
    extractEnergyCurve(decoded),
    extractSpectral(decoded),
    extractFFTSpectrum(decoded),
  ])
  const sections = detectSections(energyCurve, decoded.duration)
  let bpm: number | null = null
  let key: string | null = null
  try {
    const result = await new Promise<{ bpm: number | null; key: string | null }>((resolve, reject) => {
      const worker = new Worker('/essentia-worker.js')
      const ch = decoded.getChannelData(0)
      worker.postMessage({ channelData: ch, sampleRate: decoded.sampleRate }, [ch.buffer])
      worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
      worker.onerror = (e) => { worker.terminate(); reject(e) }
      setTimeout(() => { worker.terminate(); resolve({ bpm: null, key: null }) }, 12000)
    })
    bpm = result.bpm; key = result.key
  } catch { /* best-effort */ }
  return { label, fileName: file.name, bpm, key, durationSeconds: decoded.duration, sections, energyCurve, spectral, fftBands }
}

export default function ComparePanel() {
  const [v1File, setV1File] = useState<File | null>(null)
  const [v2File, setV2File] = useState<File | null>(null)
  const [isComparing, setIsComparing] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set())
  const [customQuestion, setCustomQuestion] = useState('')
  const [progress, setProgress] = useState('')

  function toggleTool(label: string) {
    setActiveTools((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function buildQuestion(): string {
    const toolQuestions = TOOLS
      .filter((t) => activeTools.has(t.label))
      .map((t) => t.question)
    const parts = [...toolQuestions]
    if (customQuestion.trim()) parts.push(customQuestion.trim())
    return parts.join(' Additionally: ')
  }

  function handleDrop(slot: 'v1' | 'v2') {
    return (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) slot === 'v1' ? setV1File(f) : setV2File(f)
    }
  }

  async function runComparison() {
    if (!v1File || !v2File) return
    if (v1File.size > MAX_MB * 1024 * 1024 || v2File.size > MAX_MB * 1024 * 1024) {
      setError(`Files must be under ${MAX_MB} MB each.`); return
    }
    setIsComparing(true); setError(null); setResult(null)
    try {
      setProgress('Extracting v1…')
      const snap1 = await extractSnapshot(v1File, 'v1')
      setProgress('Extracting v2…')
      const snap2 = await extractSnapshot(v2File, 'v2')
      setProgress('Asking Claude…')
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v1: snap1, v2: snap2, customQuestion: buildQuestion() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Server error (${res.status})`)
      }
      const data: CompareResult = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setIsComparing(false); setProgress('')
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {(['v1', 'v2'] as const).map((slot) => {
          const file = slot === 'v1' ? v1File : v2File
          const setFile = slot === 'v1' ? setV1File : setV2File
          const label = slot === 'v1' ? 'Version 1 (old)' : 'Version 2 (new)'
          return (
            <label key={slot} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop(slot)}
              className="block border border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-white/40 transition-colors">
              <input type="file" accept={ACCEPT} className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
              {file ? (
                <>
                  <p className="text-xs text-[#4f98a3] font-medium uppercase tracking-widest mb-1">{slot.toUpperCase()}</p>
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-white/30 mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-white/30 text-sm">Drop or tap to browse</p>
                </>
              )}
            </label>
          )
        })}
      </div>

      {error && (
        <div className="bg-[#dd6974]/10 border border-[#dd6974]/30 rounded-xl px-4 py-3 text-sm text-[#dd6974]">⚠️ {error}</div>
      )}

      {/* Multi-select focus tools */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-widest">Focus areas <span className="text-white/20 normal-case tracking-normal">(select multiple)</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TOOLS.map((tool) => (
            <button key={tool.label} onClick={() => toggleTool(tool.label)}
              className={`text-left border rounded-xl px-3 py-2.5 transition-all ${
                activeTools.has(tool.label)
                  ? 'bg-white/10 border-white/30'
                  : `${tool.color} hover:border-white/30 hover:bg-white/5`
              }`}>
              <span className="text-base leading-none">{tool.icon}</span>
              <p className="text-xs font-medium text-white/80 mt-1.5 leading-tight">{tool.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-white/40 uppercase tracking-widest">Additional focus <span className="text-white/20 normal-case tracking-normal">(optional)</span></label>
        <textarea rows={2} value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)}
          placeholder="e.g. Did the low-end mud improve? Is the drop hitting harder?"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30 resize-none" />
      </div>

      <button onClick={runComparison} disabled={!v1File || !v2File || isComparing}
        className="w-full py-3 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
        {isComparing ? progress || 'Comparing…' : result ? 'Re-compare' : 'Compare Versions'}
      </button>

      {result && <CompareResultView result={result} v1Name={v1File?.name ?? 'v1'} v2Name={v2File?.name ?? 'v2'} />}
    </div>
  )
}
