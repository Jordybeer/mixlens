'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { extractEnergyCurve, extractSpectral, extractFFTSpectrum, detectSections } from '@/lib/audioAnalysis'
import type { AnalysisResult, Section } from '@/types/analysis'
import FeedbackList from '@/components/FeedbackList'
import TrackMeta from '@/components/TrackMeta'
import WaveformPlayer from '@/components/WaveformPlayer'
import EnergyChart from '@/components/EnergyChart'
import SpectrumChart from '@/components/SpectrumChart'
import AnalysisSkeleton from '@/components/AnalysisSkeleton'
import CopyButton from '@/components/CopyButton'
import CostBadge from '@/components/CostBadge'
import ExportPDF from '@/components/ExportPDF'
import HistoryPanel from '@/components/HistoryPanel'
import { ToolsGrid } from '@/components/ToolsPanel'
import ComparePanel from '@/components/ComparePanel'
import SectionEditor from '@/components/SectionEditor'
import AudioCropSelector from '@/components/AudioCropSelector'

const MAX_FILE_MB = 80
const ACCEPT = '.wav,.mp3,.aif,.aiff,.flac,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/aiff,audio/x-aiff,audio/flac,audio/ogg'

type Mode = 'analyse' | 'compare'

function fmtCost(usd: number) {
  if (usd === 0) return null
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('analyse')
  const [seekTime, setSeekTime] = useState<number | null>(null)
  const [manualSections, setManualSections] = useState<Section[] | null>(null)
  const [whatChanged, setWhatChanged] = useState('')
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null)
  const [decodedDuration, setDecodedDuration] = useState(0)
  const [cropStart, setCropStart] = useState(0)
  const [cropEnd, setCropEnd] = useState(0)
  const [energyForCrop, setEnergyForCrop] = useState<{ time: number; rms: number }[]>([])

  const {
    audioFile, audioUrl, isAnalysing, result, error, customQuestion,
    setAudioFile, setIsAnalysing, setResult, setError, setCustomQuestion, reset,
    audioTime, setSeekTo, totalSpentUsd,
  } = useAnalysisStore()

  // Keep seekTime in sync with WaveformPlayer's audioTime for pre-analysis stamping
  // audioTime flows from the store (updated by WaveformPlayer)
  const currentSeekTime = audioTime > 0 ? audioTime : seekTime

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_FILE_MB} MB.`)
      return
    }
    reset()
    setManualSections(null)
    setSeekTime(null)
    setWhatChanged('')
    setDecodedBuffer(null)
    setDecodedDuration(0)
    setCropStart(0)
    setCropEnd(0)
    setEnergyForCrop([])
    setAudioFile(file)

    try {
      const ab = await file.arrayBuffer()
      const ctx = new AudioContext()
      const buf = await ctx.decodeAudioData(ab)
      setDecodedBuffer(buf)
      setDecodedDuration(buf.duration)
      setCropEnd(buf.duration)
      const curve = await extractEnergyCurve(buf)
      setEnergyForCrop(curve)
    } catch { /* will decode again on analyse */ }
  }

  function cropBuffer(buf: AudioBuffer, start: number, end: number): AudioBuffer {
    const sampleRate = buf.sampleRate
    const startSample = Math.floor(start * sampleRate)
    const endSample = Math.min(Math.ceil(end * sampleRate), buf.length)
    const length = endSample - startSample
    const ctx = new AudioContext()
    const cropped = ctx.createBuffer(buf.numberOfChannels, length, sampleRate)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      cropped.copyToChannel(buf.getChannelData(ch).subarray(startSample, endSample), ch)
    }
    return cropped
  }

  async function runAnalysis() {
    if (!audioFile) return
    setIsAnalysing(true)
    setError(null)
    try {
      let decoded = decodedBuffer
      if (!decoded) {
        const ab = await audioFile.arrayBuffer().catch(() => { throw new Error('Could not read file. Try re-exporting from Ableton.') })
        const audioCtx = new AudioContext()
        decoded = await audioCtx.decodeAudioData(ab).catch(() => { throw new Error("Could not decode audio. Make sure it's a valid WAV or MP3.") })
        setDecodedBuffer(decoded)
        setDecodedDuration(decoded.duration)
        if (cropEnd === 0) setCropEnd(decoded.duration)
      }

      const isCropped = cropStart > 0.5 || cropEnd < decoded.duration - 0.5
      const workingBuffer = isCropped ? cropBuffer(decoded, cropStart, cropEnd) : decoded
      const croppedDuration = workingBuffer.duration

      const [energyCurve, spectral, fftSpectrum] = await Promise.all([
        extractEnergyCurve(workingBuffer),
        extractSpectral(workingBuffer),
        extractFFTSpectrum(workingBuffer),
      ])

      const autoSections = detectSections(energyCurve, croppedDuration)
      const sections: Section[] = manualSections && manualSections.length > 0
        ? manualSections.map((s, i) => ({
            ...s,
            endSeconds: manualSections[i + 1]?.startSeconds ?? croppedDuration,
          }))
        : autoSections

      let bpm: number | null = null
      let key: string | null = null
      try {
        const r = await runEssentiaWorker(workingBuffer)
        bpm = r.bpm; key = r.key
      } catch { /* best-effort */ }

      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpm, key,
          durationSeconds: croppedDuration,
          cropInfo: isCropped ? { originalDuration: decodedDuration, cropStart, cropEnd } : null,
          sections,
          sectionsAreManual: manualSections != null && manualSections.length > 0,
          energyCurve,
          spectral,
          fftBands: fftSpectrum,
          customQuestion,
          whatChanged: whatChanged.trim() || null,
        }),
      })

      if (res.status === 429) throw new Error('Rate limit hit — wait a moment and try again.')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Server error (${res.status})`)
      }

      const data: AnalysisResult = await res.json()
      setResult({ ...data, fftSpectrum, sections }, audioFile.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setIsAnalysing(false)
    }
  }

  const displaySections = manualSections ?? result?.sections ?? []
  const duration = decodedDuration || result?.durationSeconds || 0
  const hasEnergy = energyForCrop.length > 0
  const totalCostStr = fmtCost(totalSpentUsd)

  return (
    <main className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">MixLens</span>
          <span className="text-xs text-white/30 font-mono">v0.6</span>
        </div>
        <div className="flex items-center gap-4">
          {totalCostStr && (
            <div title="Total spent across all analyses this session" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 cursor-default select-none">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-40">
                <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M3.5 5h3M5 3.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="text-[11px] font-mono text-white/40">{totalCostStr} total</span>
            </div>
          )}
          <HistoryPanel />
          {audioFile && mode === 'analyse' && (
            <button
              onClick={() => { reset(); setManualSections(null); setSeekTime(null); setWhatChanged(''); setDecodedBuffer(null); setDecodedDuration(0); setCropStart(0); setCropEnd(0); setEnergyForCrop([]) }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >× Clear</button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
          {(['analyse', 'compare'] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}>
              {m === 'compare' ? '⇄ Compare' : '⬡ Analyse'}
            </button>
          ))}
        </div>

        {mode === 'compare' ? (
          <ComparePanel />
        ) : (
          <>
            <label
              htmlFor="audio-upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              className="block border border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-white/40 transition-colors"
            >
              <input id="audio-upload" type="file" accept={ACCEPT} className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {audioFile ? (
                <p className="text-sm text-white/70">
                  <span className="text-white font-medium">{audioFile.name}</span>
                  {' — '}{(audioFile.size / 1024 / 1024).toFixed(1)} MB
                  {decodedDuration > 0 && <span className="text-white/30 ml-2 font-mono">{fmtTime(decodedDuration)}</span>}
                </p>
              ) : (
                <>
                  <p className="text-white/50 text-sm">Drop a WAV or MP3 here</p>
                  <p className="text-white/25 text-xs mt-1">or tap to browse · WAV · MP3 · AIFF · FLAC · max {MAX_FILE_MB} MB</p>
                </>
              )}
            </label>

            {error && (
              <div className="bg-[#dd6974]/10 border border-[#dd6974]/30 rounded-xl px-4 py-3 text-sm text-[#dd6974]">⚠️ {error}</div>
            )}

            {audioUrl && (
              <WaveformPlayer
                url={audioUrl}
                sections={displaySections}
                duration={duration}
              />
            )}

            {hasEnergy && duration > 0 && (
              <AudioCropSelector
                duration={duration}
                energyCurve={energyForCrop}
                cropStart={cropStart}
                cropEnd={cropEnd}
                onChange={(s, e) => { setCropStart(s); setCropEnd(e) }}
              />
            )}

            {result && (
              <EnergyChart
                energyCurve={result.energyCurve}
                sections={displaySections}
                duration={result.durationSeconds}
                bpm={result.bpm}
                onSeek={setSeekTo}
              />
            )}

            {result && (
              <SpectrumChart
                bands={result.fftSpectrum ?? []}
                musicalKey={result.key}
                showKeyScale={true}
              />
            )}

            {audioFile && (
              <div className="space-y-5 border border-white/10 rounded-xl p-5 bg-white/[0.02]">
                <p className="text-xs text-white/40 uppercase tracking-widest">Context for Claude</p>

                <div className="space-y-2">
                  <label className="text-xs text-white/50">What did you change? <span className="text-white/20">(optional)</span></label>
                  <textarea rows={2} value={whatChanged} onChange={(e) => setWhatChanged(e.target.value)}
                    placeholder="e.g. HP'd kick at 60 Hz, sidechain 40–60 Hz sine at –2 oct via KHS compressor…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none leading-relaxed" />
                </div>

                <SectionEditor
                  duration={duration}
                  seekTime={currentSeekTime}
                  onChange={setManualSections}
                />

                <div className="space-y-2">
                  <label htmlFor="custom-question" className="text-xs text-white/50">Focus question <span className="text-white/20">(optional)</span></label>
                  <ToolsGrid />
                  <textarea id="custom-question" rows={2} value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Select a preset above or write your own…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none leading-relaxed" />
                </div>
              </div>
            )}

            <button onClick={runAnalysis} disabled={!audioFile || isAnalysing}
              className="w-full py-3 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
              {isAnalysing ? 'Analysing…' : result ? 'Re-analyse' : 'Analyse Track'}
            </button>

            {isAnalysing && <AnalysisSkeleton />}

            {!isAnalysing && result && (
              <div className="space-y-6">
                <TrackMeta result={result} />

                {/* Cost badge for this analysis */}
                {result.costEstimate && (
                  <div className="flex items-center justify-between">
                    <CostBadge cost={result.costEstimate} />
                    <div className="flex items-center gap-2">
                      <ExportPDF result={result} fileName={audioFile?.name ?? 'analysis'} />
                      <CopyButton result={result} />
                    </div>
                  </div>
                )}
                {!result.costEstimate && (
                  <div className="flex justify-end gap-2">
                    <ExportPDF result={result} fileName={audioFile?.name ?? 'analysis'} />
                    <CopyButton result={result} />
                  </div>
                )}

                <FeedbackList />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function runEssentiaWorker(buffer: AudioBuffer): Promise<{ bpm: number | null; key: string | null }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/essentia-worker.js')
    const channelData = buffer.getChannelData(0)
    worker.postMessage({ channelData, sampleRate: buffer.sampleRate }, [channelData.buffer])
    worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
    worker.onerror = (e) => { worker.terminate(); reject(e) }
    setTimeout(() => { worker.terminate(); resolve({ bpm: null, key: null }) }, 15000)
  })
}
