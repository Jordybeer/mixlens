'use client'

import { useRef, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { extractEnergyCurve, detectSections } from '@/lib/audioAnalysis'
import type { AnalysisResult } from '@/types/analysis'
import FeedbackList from '@/components/FeedbackList'
import TrackMeta from '@/components/TrackMeta'
import WaveformPlayer from '@/components/WaveformPlayer'

export default function Home() {
  const { audioFile, audioUrl, isAnalysing, result, customQuestion,
    setAudioFile, setIsAnalysing, setResult, setCustomQuestion } = useAnalysisStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setAudioFile(file)
  }

  async function runAnalysis() {
    if (!audioFile) return
    setIsAnalysing(true)
    setError(null)
    try {
      const arrayBuffer = await audioFile.arrayBuffer()
      const audioCtx = new AudioContext()
      const decoded = await audioCtx.decodeAudioData(arrayBuffer)

      const energyCurve = await extractEnergyCurve(decoded)
      const sections = detectSections(energyCurve, decoded.duration)

      // BPM placeholder — Essentia Worker integration goes here
      const bpm: number | null = null
      const key: string | null = null

      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpm, key,
          durationSeconds: decoded.duration,
          sections,
          energyCurve,
          customQuestion,
        }),
      })

      if (!res.ok) throw new Error('Analysis request failed')
      const data: AnalysisResult = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsAnalysing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center gap-3">
        <span className="text-lg font-semibold tracking-tight">MixLens</span>
        <span className="text-xs text-white/30 font-mono">v0.1</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          className="border border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-white/40 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {audioFile ? (
            <p className="text-sm text-white/70">
              <span className="text-white font-medium">{audioFile.name}</span>
              {' '}— {(audioFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
          ) : (
            <>
              <p className="text-white/50 text-sm">Drop a WAV or MP3 here</p>
              <p className="text-white/25 text-xs mt-1">or click to browse</p>
            </>
          )}
        </div>

        {/* Waveform */}
        {audioUrl && <WaveformPlayer url={audioUrl} />}

        {/* Question */}
        <div className="space-y-2">
          <label className="text-xs text-white/40 uppercase tracking-widest">Optional question</label>
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Does it drag? Check my low end."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Analyse button */}
        <button
          onClick={runAnalysis}
          disabled={!audioFile || isAnalysing}
          className="w-full py-3 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {isAnalysing ? 'Analysing…' : 'Analyse Track'}
        </button>

        {error && <p className="text-sm text-[#dd6974]">{error}</p>}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            <TrackMeta result={result} />
            <FeedbackList />
          </div>
        )}
      </div>
    </main>
  )
}
