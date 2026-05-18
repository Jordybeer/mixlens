'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { extractEnergyCurve, detectSections, extractSpectral } from '@/lib/audioAnalysis'
import type { AnalysisResult } from '@/types/analysis'
import FeedbackList from '@/components/FeedbackList'
import TrackMeta from '@/components/TrackMeta'
import WaveformPlayer from '@/components/WaveformPlayer'
import EnergyChart from '@/components/EnergyChart'
import AnalysisSkeleton from '@/components/AnalysisSkeleton'
import CopyButton from '@/components/CopyButton'
import HistoryPanel from '@/components/HistoryPanel'

const MAX_FILE_MB = 80

export default function Home() {
  const {
    audioFile, audioUrl, isAnalysing, result, error, customQuestion,
    setAudioFile, setIsAnalysing, setResult, setError, setCustomQuestion, reset,
  } = useAnalysisStore()

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large — max ${MAX_FILE_MB} MB. Export a lower-quality MP3 from Ableton.`)
      return
    }
    const supported = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/flac', 'audio/ogg', 'audio/x-wav']
    if (!supported.includes(file.type) && !file.name.match(/\.(wav|mp3|aif|aiff|flac|ogg)$/i)) {
      setError('Unsupported format. Use WAV, MP3, AIFF, or FLAC.')
      return
    }
    reset()
    setAudioFile(file)
  }

  async function runAnalysis() {
    if (!audioFile) return
    setIsAnalysing(true)
    setError(null)
    try {
      let arrayBuffer: ArrayBuffer
      try {
        arrayBuffer = await audioFile.arrayBuffer()
      } catch {
        throw new Error('Could not read file. Try re-exporting from Ableton.')
      }

      const audioCtx = new AudioContext()
      let decoded: AudioBuffer
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer)
      } catch {
        throw new Error('Could not decode audio. Make sure it\'s a valid WAV or MP3.')
      }

      const [energyCurve, spectral] = await Promise.all([
        extractEnergyCurve(decoded),
        extractSpectral(decoded),
      ])
      const sections = detectSections(energyCurve, decoded.duration)

      let bpm: number | null = null
      let key: string | null = null
      try {
        const workerResult = await runEssentiaWorker(decoded)
        bpm = workerResult.bpm
        key = workerResult.key
      } catch {
        // best-effort
      }

      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm, key, durationSeconds: decoded.duration, sections, energyCurve, spectral, customQuestion }),
      })

      if (res.status === 429) throw new Error('Rate limit hit — wait a moment and try again.')
      if (res.status === 500) throw new Error('Analysis failed on the server. Check your API key is set in Vercel.')
      if (!res.ok) throw new Error(`Unexpected error (${res.status}). Try again.`)

      const data: AnalysisResult = await res.json()
      setResult(data, audioFile.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setIsAnalysing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">MixLens</span>
          <span className="text-xs text-white/30 font-mono">v0.3</span>
        </div>
        <div className="flex items-center gap-4">
          <HistoryPanel />
          {audioFile && (
            <button onClick={reset} className="text-xs text-white/30 hover:text-white/60 transition-colors">
              ✕ Clear
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        <label
          htmlFor="audio-upload"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          className="block border border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-white/40 transition-colors"
        >
          <input
            id="audio-upload"
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {audioFile ? (
            <p className="text-sm text-white/70">
              <span className="text-white font-medium">{audioFile.name}</span>
              {' — '}{(audioFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
          ) : (
            <>
              <p className="text-white/50 text-sm">Drop a WAV or MP3 here</p>
              <p className="text-white/25 text-xs mt-1">or tap to browse — max {MAX_FILE_MB} MB</p>
            </>
          )}
        </label>

        {/* Error banner */}
        {error && (
          <div className="bg-[#dd6974]/10 border border-[#dd6974]/30 rounded-xl px-4 py-3 text-sm text-[#dd6974]">
            ⚠️ {error}
          </div>
        )}

        {audioUrl && (
          <WaveformPlayer url={audioUrl} sections={result?.sections ?? []} duration={result?.durationSeconds ?? 0} />
        )}

        {result && (
          <EnergyChart energyCurve={result.energyCurve} sections={result.sections} duration={result.durationSeconds} />
        )}

        <div className="space-y-2">
          <label htmlFor="custom-question" className="text-xs text-white/40 uppercase tracking-widest">
            Optional question
          </label>
          <input
            id="custom-question"
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Does it drag? Check my low end."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30"
          />
        </div>

        <button
          onClick={runAnalysis}
          disabled={!audioFile || isAnalysing}
          className="w-full py-3 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {isAnalysing ? 'Analysing…' : result ? 'Re-analyse' : 'Analyse Track'}
        </button>

        {isAnalysing && <AnalysisSkeleton />}

        {!isAnalysing && result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <TrackMeta result={result} />
            </div>
            <div className="flex justify-end">
              <CopyButton result={result} />
            </div>
            <FeedbackList />
          </div>
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
