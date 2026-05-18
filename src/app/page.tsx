'use client'

import { useState, useEffect } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { useProjectStore } from '@/store/useProjectStore'
import { extractEnergyCurve, extractSpectral, extractFFTSpectrum, detectSections, estimateLUFS } from '@/lib/audioAnalysis'
import { createClient } from '@/lib/supabase'
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
import ToolsPanel from '@/components/ToolsPanel'
import ComparePanel from '@/components/ComparePanel'
import SectionEditor from '@/components/SectionEditor'
import AudioCropSelector from '@/components/AudioCropSelector'
import ProjectSelector from '@/components/ProjectSelector'
import ProjectLandingPicker from '@/components/ProjectLandingPicker'
import ApiKeyModal from '@/components/ApiKeyModal'
import ProjectFilesPanel from '@/components/ProjectFilesPanel'
import ThemeToggle from '@/components/ThemeToggle'

const MAX_FILE_MB = 80
const MAX_ANALYSES = 10
const ACCEPT = '.wav,.mp3,.aif,.aiff,.flac,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/aiff,audio/x-aiff,audio/flac,audio/ogg'

type Mode = 'analyse' | 'compare' | 'history'

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
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(null)

  const {
    audioFile, isAnalysing, result, error, customQuestion,
    setAudioFile, setIsAnalysing, setResult, setError, setCustomQuestion, reset,
    audioTime, totalSpentUsd,
  } = useAnalysisStore()

  const { activeProjectId, setLastUsedStoragePath } = useProjectStore()

  const currentSeekTime = audioTime > 0 ? audioTime : seekTime
  void currentSeekTime
  const totalCostStr = fmtCost(totalSpentUsd)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
      setUserEmail(data.user?.email ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

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

  function handleProjectFileSelected(file: File, storagePath: string) {
    setSelectedStoragePath(storagePath)
    if (activeProjectId) setLastUsedStoragePath(activeProjectId, storagePath)
    handleFile(file)
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
    if (!activeProjectId) {
      setError('Select or create a project before analysing.')
      return
    }
    if (!userId) {
      setError('Not signed in.')
      return
    }

    setIsAnalysing(true)
    setError(null)

    try {
      const supabase = createClient()
      const { count, error: countError } = await supabase
        .from('analyses')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', activeProjectId)

      if (countError) throw new Error('Could not check storage limit. Try again.')
      if ((count ?? 0) >= MAX_ANALYSES) {
        setError(`Storage limit reached — this project already has ${MAX_ANALYSES} analyses. Delete some from History to free space.`)
        setIsAnalysing(false)
        return
      }

      let audioStoragePath: string | null = selectedStoragePath

      if (!audioStoragePath) {
        const ext = audioFile.name.split('.').pop() ?? 'audio'
        const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('audio-files')
          .upload(storagePath, audioFile, { upsert: false })
        if (uploadError) {
          console.warn('[runAnalysis] audio upload failed:', uploadError.message)
        } else {
          audioStoragePath = storagePath
        }
      }

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

      const lufs = estimateLUFS(energyCurve)
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
          lufs,
          customQuestion,
          whatChanged: whatChanged.trim() || null,
          projectId: activeProjectId,
          fileName: audioFile.name,
          audioStoragePath,
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

  const duration = decodedDuration || result?.durationSeconds || 0
  const hasEnergy = energyForCrop.length > 0

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {showKeyModal && userId && (
        <ApiKeyModal
          userId={userId}
          onSaved={() => setShowKeyModal(false)}
          canDismiss
          onDismiss={() => setShowKeyModal(false)}
        />
      )}

      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
        className="px-6 py-4 flex items-center justify-between sticky top-0 z-20 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight"><a href="https://mixlens.jordy.beer">MixLens</a></span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>v0.8</span>
        </div>
        <div className="flex items-center gap-3">
          {userId && <ProjectSelector userId={userId} />}

          {totalCostStr && (
            <div title="Total spent across all analyses"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-default select-none">
              <span className="text-[11px] font-mono">{totalCostStr} total</span>
            </div>
          )}

          <ThemeToggle />

          <button
            onClick={() => setShowKeyModal(true)}
            title="API Key settings"
            style={{ color: 'var(--text-muted)' }}
            className="hover:opacity-80 transition-opacity"
            aria-label="API Key settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5"/>
              <path d="M21 2l-9.6 9.6"/>
              <path d="M15.5 7.5L17 6"/>
              <path d="M17 9l1.5-1.5"/>
            </svg>
          </button>

          {userEmail && (
            <div className="flex items-center gap-2">
              <span className="text-xs hidden sm:block" style={{ color: 'var(--text-faint)' }}>{userEmail}</span>
              <button
                onClick={async () => {
                  const { signOut } = await import('@/lib/auth')
                  await signOut().catch(() => null)
                  setUserId(null)
                  setUserEmail(null)
                  reset()
                }}
                className="text-xs transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                Sign out
              </button>
            </div>
          )}

          {activeProjectId && audioFile && mode === 'analyse' && (
            <button
              onClick={() => {
                reset()
                setManualSections(null)
                setSeekTime(null)
                setWhatChanged('')
                setDecodedBuffer(null)
                setDecodedDuration(0)
                setCropStart(0)
                setCropEnd(0)
                setEnergyForCrop([])
                setSelectedStoragePath(null)
              }}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >× Clear</button>
          )}
        </div>
      </header>

      {userId && !activeProjectId ? (
        <ProjectLandingPicker userId={userId} />
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {([
              { id: 'analyse', label: '⬡ Analyse' },
              { id: 'compare', label: '⇄ Compare' },
              { id: 'history', label: '◷ History' },
            ] as { id: Mode; label: string }[]).map(({ id, label }) => (
              <button key={id} onClick={() => setMode(id)}
                className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={mode === id
                  ? { background: 'var(--bg-panel)', color: 'var(--text)' }
                  : { color: 'var(--text-muted)' }
                }>
                {label}
              </button>
            ))}
          </div>

          {mode === 'history' ? (
            <HistoryPanel />
          ) : mode === 'compare' ? (
            <ComparePanel />
          ) : (
            <>
              {activeProjectId && userId && (
                <ProjectFilesPanel
                  projectId={activeProjectId}
                  userId={userId}
                  onFileSelected={handleProjectFileSelected}
                  selectedStoragePath={selectedStoragePath}
                />
              )}

              <label
                htmlFor="audio-upload"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setSelectedStoragePath(null); handleFile(f) } }}
                className="block rounded-xl p-10 text-center cursor-pointer transition-colors"
                style={{ border: '1px dashed var(--border)' }}
              >
                <input id="audio-upload" type="file" accept={ACCEPT} className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedStoragePath(null); handleFile(f) } }} />
                {audioFile ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text)' }} className="font-medium">{audioFile.name}</span>
                    {' — '}{(audioFile.size / 1024 / 1024).toFixed(1)} MB
                    {decodedDuration > 0 && <span className="ml-2 font-mono" style={{ color: 'var(--text-faint)' }}>{fmtTime(decodedDuration)}</span>}
                    {selectedStoragePath && <span className="ml-2 text-xs" style={{ color: 'var(--accent)' }}>· from project</span>}
                  </p>
                ) : (
                  <>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Drop a file here or click to browse</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>WAV · MP3 · AIFF · FLAC · max {MAX_FILE_MB} MB</p>
                  </>
                )}
              </label>

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sev-critical) 30%, transparent)', color: 'var(--sev-critical)' }}>⚠️ {error}</div>
              )}

              {audioFile && <WaveformPlayer />}

              {hasEnergy && duration > 0 && (
                <AudioCropSelector
                  duration={duration}
                  energyCurve={energyForCrop}
                  cropStart={cropStart}
                  cropEnd={cropEnd}
                  onChange={(s, e) => { setCropStart(s); setCropEnd(e) }}
                />
              )}

              {result && <EnergyChart />}

              {result && (
                <SpectrumChart bands={result.fftSpectrum ?? []} musicalKey={result.key} showKeyScale />
              )}

              {audioFile && (
                <div className="space-y-5 rounded-xl p-5" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Context for Claude</p>

                  <div className="space-y-2">
                    <label className="text-xs" style={{ color: 'var(--text-muted)' }}>What did you change? <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
                    <textarea rows={2} value={whatChanged} onChange={(e) => setWhatChanged(e.target.value)}
                      placeholder="e.g. HP'd kick at 60 Hz, sidechain 40–60 Hz sine at −2 oct via KHS compressor…"
                      className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none leading-relaxed"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>

                  <SectionEditor />

                  <div className="space-y-2">
                    <label htmlFor="custom-question" className="text-xs" style={{ color: 'var(--text-muted)' }}>Focus question <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
                    <ToolsPanel />
                    <textarea id="custom-question" rows={2} value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="Select a preset above or write your own…"
                      className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none resize-none leading-relaxed"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                </div>
              )}

              <button onClick={runAnalysis} disabled={!audioFile || isAnalysing || !activeProjectId}
                className="w-full py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-white"
                style={{ background: isAnalysing ? 'var(--accent-hover)' : 'var(--accent)' }}>
                {isAnalysing ? 'Analysing…' : result ? 'Re-analyse' : 'Analyse Track'}
              </button>

              {isAnalysing && <AnalysisSkeleton />}

              {!isAnalysing && result && (
                <div className="space-y-6">
                  <TrackMeta />

                  {result.costEstimate ? (
                    <div className="flex items-center justify-between">
                      <CostBadge cost={result.costEstimate} />
                      <div className="flex items-center gap-2">
                        <ExportPDF result={result} fileName={audioFile?.name ?? 'analysis'} />
                        <CopyButton />
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <ExportPDF result={result} fileName={audioFile?.name ?? 'analysis'} />
                      <CopyButton />
                    </div>
                  )}

                  <FeedbackList />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  )
}

function runEssentiaWorker(buffer: AudioBuffer): Promise<{ bpm: number | null; key: string | null }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/essentia-worker.js')
    const channelData = new Float32Array(buffer.getChannelData(0))
    worker.postMessage({ channelData, sampleRate: buffer.sampleRate }, [channelData.buffer])
    worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
    worker.onerror  = (e) => { worker.terminate(); reject(e) }
    setTimeout(() => { worker.terminate(); resolve({ bpm: null, key: null }) }, 15000)
  })
}
