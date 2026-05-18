'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useProjectStore } from '@/store/useProjectStore'
import { useAnalysisStore, type LeanHistoryEntry } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'
import type { FeedbackItem } from '@/types/analysis'

const MAX_FILES = 10

interface DbAnalysis {
  id: string
  file_name: string
  analysed_at: string
  audio_storage_path: string | null
  lean_result: {
    bpm: number | null
    key: string | null
    durationSeconds: number
    summary: string
    feedbackItems: FeedbackItem[]
    sections: LeanHistoryEntry['sections']
    costEstimate?: LeanHistoryEntry['costEstimate']
    isDeepScan?: boolean
  }
}

function SeverityDot({ count, color }: { count: number; color: string }) {
  if (!count) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
      {count}
    </span>
  )
}

function countBySeverity(items: FeedbackItem[]) {
  return {
    critical:   items.filter((f) => f.severity === 'CRITICAL').length,
    important:  items.filter((f) => f.severity === 'IMPORTANT').length,
    validation: items.filter((f) => f.severity === 'VALIDATION').length,
  }
}

export default function HistoryPanel() {
  const [open, setOpen] = useState(false)
  const [analyses, setAnalyses] = useState<DbAnalysis[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null)
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null)

  const { activeProjectId, activeProjectName } = useProjectStore()
  const { loadFromHistory, setAudioFile } = useAnalysisStore()

  const supabase = createClient()

  const fetchAnalyses = useCallback(async () => {
    if (!activeProjectId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('analyses')
      .select('id, file_name, analysed_at, audio_storage_path, lean_result')
      .eq('project_id', activeProjectId)
      .order('analysed_at', { ascending: false })
      .limit(50)
    if (!error && data) setAnalyses(data as DbAnalysis[])
    setLoading(false)
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) fetchAnalyses()
  }, [open, fetchAnalyses])

  useEffect(() => {
    if (!open) {
      setActiveAudioUrl(null)
      setActiveAudioId(null)
    }
  }, [open])

  async function handleLoad(analysis: DbAnalysis) {
    const entry: LeanHistoryEntry = {
      id: analysis.id,
      fileName: analysis.file_name,
      analysedAt: new Date(analysis.analysed_at).getTime(),
      bpm: analysis.lean_result.bpm,
      key: analysis.lean_result.key,
      durationSeconds: analysis.lean_result.durationSeconds,
      summary: analysis.lean_result.summary,
      feedbackItems: analysis.lean_result.feedbackItems ?? [],
      sections: analysis.lean_result.sections ?? [],
      costEstimate: analysis.lean_result.costEstimate,
      isDeepScan: analysis.lean_result.isDeepScan,
      audioStoragePath: analysis.audio_storage_path,
    }
    loadFromHistory(entry)

    if (analysis.audio_storage_path) {
      const { data } = await supabase.storage
        .from('audio-files')
        .createSignedUrl(analysis.audio_storage_path, 3600)
      if (data?.signedUrl) {
        try {
          const blob = await fetch(data.signedUrl).then((r) => r.blob())
          const file = new File([blob], analysis.file_name, { type: blob.type || 'audio/mpeg' })
          setAudioFile(file)
        } catch {
          // Signed URL preview failed — analysis still loads without audio
        }
      }
    }

    setOpen(false)
  }

  async function handlePreviewAudio(analysis: DbAnalysis, e: React.MouseEvent) {
    e.stopPropagation()
    if (!analysis.audio_storage_path) return

    if (activeAudioId === analysis.id) {
      setActiveAudioUrl(null)
      setActiveAudioId(null)
      return
    }

    const { data } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(analysis.audio_storage_path, 3600)
    if (data?.signedUrl) {
      setActiveAudioUrl(data.signedUrl)
      setActiveAudioId(analysis.id)
    }
  }

  async function handleDelete(analysis: DbAnalysis, e: React.MouseEvent) {
    e.stopPropagation()
    setDeletingId(analysis.id)

    if (analysis.audio_storage_path) {
      await supabase.storage
        .from('audio-files')
        .remove([analysis.audio_storage_path])
    }

    const { error } = await supabase
      .from('analyses')
      .delete()
      .eq('id', analysis.id)

    if (!error) {
      setAnalyses((prev) => prev.filter((a) => a.id !== analysis.id))
      if (activeAudioId === analysis.id) {
        setActiveAudioUrl(null)
        setActiveAudioId(null)
      }
    }
    setDeletingId(null)
  }

  const atLimit = analyses.length >= MAX_FILES

  if (!activeProjectId) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-white/30 hover:text-white/60 transition-colors flex items-center gap-1"
      >
        ◷ History
        {analyses.length > 0 && !open && (
          <span className="text-white/20">({analyses.length})</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-96 bg-[var(--color-surface)] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <span className="text-xs text-white/50 uppercase tracking-widest">History</span>
              {activeProjectName && (
                <span className="ml-2 text-xs text-white/25 truncate max-w-[120px] inline-block align-bottom">
                  {activeProjectName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {atLimit && (
                <span className="text-[10px] text-[var(--color-notification)] border border-[var(--color-notification)]/30 rounded px-1.5 py-0.5">
                  {MAX_FILES}/{MAX_FILES} files
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-white/25 hover:text-white/60 transition-colors text-base leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {atLimit && (
            <div className="px-4 py-2.5 bg-[var(--color-notification)]/8 border-b border-[var(--color-notification)]/20">
              <p className="text-xs text-[var(--color-notification)]">
                Storage limit reached ({MAX_FILES} analyses). Delete entries below to free space before analysing again.
              </p>
            </div>
          )}

          {loading ? (
            <div className="px-4 py-8 text-center text-xs text-white/30">Loading…</div>
          ) : analyses.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-white/30">
              No analyses yet for this project.
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-white/5">
              {analyses.map((analysis) => {
                const lr = analysis.lean_result
                const { critical, important, validation } = countBySeverity(lr.feedbackItems ?? [])
                const isDeleting = deletingId === analysis.id
                const hasAudio = !!analysis.audio_storage_path
                const isPreviewing = activeAudioId === analysis.id

                return (
                  <li key={analysis.id} className={isDeleting ? 'opacity-40 pointer-events-none' : ''}>
                    <div className="px-4 py-3 hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => handleLoad(analysis)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm text-white/80 truncate font-medium leading-tight">
                            {analysis.file_name}
                          </p>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasAudio && (
                            <button
                              onClick={(e) => handlePreviewAudio(analysis, e)}
                              title={isPreviewing ? 'Stop preview' : 'Preview audio'}
                              className={`text-[10px] transition-colors ${
                                isPreviewing
                                  ? 'text-[var(--color-primary)]'
                                  : 'text-white/25 hover:text-white/60'
                              }`}
                            >
                              {isPreviewing ? '■' : '▶'}
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(analysis, e)}
                            title="Delete this analysis"
                            className="text-[10px] text-white/20 hover:text-[var(--color-notification)] transition-colors"
                          >
                            {isDeleting ? '…' : '×'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] text-white/25 font-mono">
                          {new Date(analysis.analysed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {lr.bpm && <span className="text-[10px] text-white/25 font-mono">{lr.bpm} BPM</span>}
                        {lr.key && <span className="text-[10px] text-white/25 font-mono">{lr.key}</span>}
                        <span className="text-[10px] text-white/25 font-mono">{formatTime(lr.durationSeconds)}</span>
                        <SeverityDot count={critical} color="var(--color-notification)" />
                        <SeverityDot count={important} color="var(--color-gold)" />
                        <SeverityDot count={validation} color="var(--color-success)" />
                      </div>

                      {isPreviewing && activeAudioUrl && (
                        <audio
                          src={activeAudioUrl}
                          autoPlay
                          controls
                          className="mt-2 w-full h-8"
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
