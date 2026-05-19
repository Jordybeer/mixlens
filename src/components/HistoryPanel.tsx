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

// Self-contained inline panel — no dropdown trigger, mounts and fetches immediately.
export default function HistoryPanel({ onLoad }: { onLoad?: () => void } = {}) {
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

  // Fetch on mount and when project changes
  useEffect(() => {
    fetchAnalyses()
  }, [fetchAnalyses])

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
    onLoad?.()

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
    <div className="space-y-3">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeProjectName && (
            <span className="text-xs truncate max-w-[160px]" style={{ color: 'var(--text-faint)' }}>
              {activeProjectName}
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {analyses.length}/{MAX_FILES}
          </span>
        </div>
        <button
          onClick={fetchAnalyses}
          title="Refresh"
          className="text-xs transition-opacity hover:opacity-80"
          style={{ color: 'var(--text-faint)' }}
        >
          ↺
        </button>
      </div>

      {atLimit && (
        <div
          className="px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'color-mix(in srgb, var(--sev-critical) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)',
            color: 'var(--sev-critical)',
          }}
        >
          Storage limit reached ({MAX_FILES} analyses). Delete entries to free space.
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-xs" style={{ color: 'var(--text-faint)' }}>Loading…</div>
      ) : analyses.length === 0 ? (
        <div className="py-10 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
          No analyses yet for this project.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {analyses.map((analysis) => {
            const lr = analysis.lean_result
            const { critical, important, validation } = countBySeverity(lr.feedbackItems ?? [])
            const isDeleting = deletingId === analysis.id
            const hasAudio = !!analysis.audio_storage_path
            const isPreviewing = activeAudioId === analysis.id

            return (
              <li key={analysis.id} className={isDeleting ? 'opacity-40 pointer-events-none' : ''}>
                <div className="py-3 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleLoad(analysis)}
                      className="flex-1 text-left min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <p className="text-sm truncate font-medium leading-tight" style={{ color: 'var(--text)' }}>
                        {analysis.file_name}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasAudio && (
                        <button
                          onClick={(e) => handlePreviewAudio(analysis, e)}
                          title={isPreviewing ? 'Stop preview' : 'Preview audio'}
                          className="text-[10px] transition-colors"
                          style={{ color: isPreviewing ? 'var(--accent)' : 'var(--text-faint)' }}
                        >
                          {isPreviewing ? '■' : '▶'}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(analysis, e)}
                        title="Delete this analysis"
                        className="text-[10px] transition-colors hover:opacity-80"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {isDeleting ? '…' : '×'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                      {new Date(analysis.analysed_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric',
                      })}
                    </span>
                    {lr.bpm && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                        {Math.round(lr.bpm)} BPM
                      </span>
                    )}
                    {lr.key && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                        {lr.key}
                      </span>
                    )}
                    {lr.durationSeconds > 0 && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                        {formatTime(lr.durationSeconds)}
                      </span>
                    )}
                    {lr.isDeepScan && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                        style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
                      >
                        deep
                      </span>
                    )}
                    <SeverityDot count={critical}   color="var(--sev-critical)"   />
                    <SeverityDot count={important}  color="var(--sev-important)"  />
                    <SeverityDot count={validation} color="var(--sev-validation)" />
                  </div>

                  {lr.summary && (
                    <p
                      className="mt-1.5 text-[11px] leading-snug line-clamp-2"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {lr.summary}
                    </p>
                  )}

                  {isPreviewing && activeAudioUrl && (
                    <audio
                      key={activeAudioUrl}
                      src={activeAudioUrl}
                      controls
                      autoPlay
                      className="mt-2 w-full h-7"
                      style={{ opacity: 0.7 }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
