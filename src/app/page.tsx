'use client'

import { useState, useEffect, useRef } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { useProjectStore } from '@/store/useProjectStore'
import { extractEnergyCurve, extractSpectral, extractFFTSpectrum, detectSections, estimateLUFS } from '@/lib/audioAnalysis'
import { createClient } from '@/lib/supabase'
import { downloadProjectFileAsBlob } from '@/lib/projectFiles'
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
import ProjectSelector from '@/components/ProjectSelector'
import ApiKeyModal from '@/components/ApiKeyModal'
import ProjectFilesPanel from '@/components/ProjectFilesPanel'

const MAX_FILE_MB = 80
const MAX_ANALYSES = 10
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
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(null)
  const [autoLoadStatus, setAutoLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const prevProjectId = useRef<string | null>(null)

  const {
    audioFile, audioUrl, isAnalysing, result, error, customQuestion,
    setAudioFile, setIsAnalysing, setResult, setError, setCustomQuestion, reset,
    audioTime, setSeekTo, totalSpentUsd,
  } = useAnalysisStore()

  const { activeProjectId, lastUsedStoragePaths, setLastUsedStoragePath } = useProjectStore()

  const currentSeekTime = audioTime > 0 ? audioTime : seekTime
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

  // Auto-load last used file when project changes or on first mount
  useEffect(() => {
    if (!activeProjectId) return
    const storagePath = lastUsedStoragePaths[activeProjectId]
    if (!storagePath) return
    // Don't re-load if same project and file already loaded
    if (prevProjectId.current === activeProjectId && audioFile) return
    prevProjectId.current = activeProjectId

    setAutoLoadStatus('loading')
    downloadProjectFileAsBlob(storagePath)
      .then((blob) => {
        const fileName = storagePath.split('/').pop() ?? 'audio'
        const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' })
        setSelectedStoragePath(storagePath)
        handleFile(file)
        setAutoLoadStatus('idle')
      })
      .catch(() => {
        setAutoLoadStatus('error')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

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

  const displaySections = manualSections ?? result?.sections ?? []
  const duration = decodedDuration || result?.durationSeconds || 0
  const hasEnergy = energyForCrop.length > 0

  return (
    <main className="min-h-screen bg-[#0e0e0f] text-[#e8e6e1]">
      {showKeyModal && userId && (
        <ApiKeyModal
          userId={userId}
          onSaved={() => setShowKeyModal(false)}
          canDismiss
          onDismiss={() => setShowKeyModal(false)}
        />
      )}

      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">MixLens</span>
          <span className="text-xs text-white/30 font-mono">v0.8</span>
        </div>
        <div className="flex items-center gap-3">
          {userId && <ProjectSelector userId={userId} />}

          {totalCostStr && (
            <div title="Total spent across all analyses" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 cursor-default select-none">
              <span className="text-[11px] font-mono text-white/40">{totalCostStr} total</span>
            </div>
          )}

          <HistoryPanel />

          <button
            onClick={() => setShowKeyModal(true)}
            title="API Key settings"
            className="text-white/30 hover:text-white/60 transition-colors"
            aria-label="API Key settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
          </button>

          {userEmail && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/25 hidden sm:block">{userEmail}</span>
              <button
                onClick={async () => {
                  const { signOut } = await import('@/lib/auth')
                  await signOut().catch(() => null)
                  setUserId(null)
                  setUserEmail(null)
                  reset()
                }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}

          {audioFile && mode === 'analyse' && (
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
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >× Clear</button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {!activeProjectId && (
          <div className="bg-[#e8af34]/10 border border-[#e8af34]/30 rounded-xl px-4 py-3 text-sm text-[#e8af34]">
            ⚠️ Select or create a project above before analysing.
          </div>
        )}

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
            {activeProjectId && userId && (
              <ProjectFilesPanel
                projectId={activeProjectId}
                userId={userId}
                onFileSelected={handleProjectFileSelected}
                selectedStoragePath={selectedStoragePath}
              />
            )}

            {autoLoadStatus === 'loading' && (
              <div className="flex items-center gap-2 text-xs text-white/30">
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="6" cy="6" r="4" strokeDasharray="6 20" />
                </svg>
                Restoring last file…
              </div>
            )}

            <label
              htmlFor="audio-upload"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setSelectedStoragePath(null); handleFile(f) } }}
              className="block border border-dashed border-white/20 rounded-xl p-10 text-center cursor-pointer hover:border-white/40 transition-colors"
            >
              <input id="audio-upload" type="file" accept={ACCEPT} className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedStoragePath(null); handleFile(f) } }} />
              {audioFile ? (
                <p className="text-sm text-white/70">
                  <span className="text-white font-medium">{audioFile.name}</span>
                  {' — '}{(audioFile.size / 1024 / 1024).toFixed(1)} MB
                  {decodedDuration > 0 && <span className="text-white/30 ml-2 font-mono">{fmtTime(decodedDuration)}</span>}
                  {selectedStoragePath && <span className="ml-2 text-[#4f98a3] text-xs">· from project</span>}
                </p>
              ) : (
                <>
                  <p className="text-white/50 text-sm">Drop a new file here</p>
                  <p className="text-white/25 text-xs mt-1">or use a saved file above · WAV · MP3 · AIFF · FLAC · max {MAX_FILE_MB} MB</p>
                </>
              )}
            </label>

            {error && (
              <div className="bg-[#dd6974]/10 border border-[#dd6974]/30 rounded-xl px-4 py-3 text-sm text-[#dd6974]">⚠️ {error}</div>
            )}

            {audioUrl && (
              <WaveformPlayer url={audioUrl} sections={displaySections} duration={duration} />
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
              <SpectrumChart bands={result.fftSpectrum ?? []} musicalKey={result.key} showKeyScale />
            )}

            {audioFile && (
              <div className="space-y-5 border border-white/10 rounded-xl p-5 bg-white/[0.02]">
                <p className="text-xs text-white/40 uppercase tracking-widest">Context for Claude</p>

                <div className="space-y-2">
                  <label className="text-xs text-white/50">What did you change? <span className="text-white/20">(optional)</span></label>
                  <textarea rows={2} value={whatChanged} onChange={(e) => setWhatChanged(e.target.value)}
                    placeholder="e.g. HP'd kick at 60 Hz, sidechain 40–60 Hz sine at −2 oct via KHS compressor…"
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

            <button onClick={runAnalysis} disabled={!audioFile || isAnalysing || !activeProjectId}
              className="w-full py-3 rounded-lg bg-[#4f98a3] hover:bg-[#3d7d87] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
              {isAnalysing ? 'Analysing…' : result ? 'Re-analyse' : 'Analyse Track'}
            </button>

            {isAnalysing && <AnalysisSkeleton />}

            {!isAnalysing && result && (
              <div className="space-y-6">
                <TrackMeta result={result} />

                {result.costEstimate ? (
                  <div className="flex items-center justify-between">
                    <CostBadge cost={result.costEstimate} />
                    <div className="flex items-center gap-2">
                      <ExportPDF result={result} fileName={audioFile?.name ?? 'analysis'} />
                      <CopyButton result={result} />
                    </div>
                  </div>
                ) : (
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
    const channelData = new Float32Array(buffer.getChannelData(0))
    worker.postMessage({ channelData, sampleRate: buffer.sampleRate }, [channelData.buffer])
    worker.onmessage = (e) => { worker.terminate(); resolve(e.data) }
    worker.onerror  = (e) => { worker.terminate(); reject(e) }
    setTimeout(() => { worker.terminate(); resolve({ bpm: null, key: null }) }, 15000)
  })
}
