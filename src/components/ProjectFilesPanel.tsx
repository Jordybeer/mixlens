'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import type { ProjectFile, StemRole } from '@/types/analysis'
import { STEM_ROLE_LABELS } from '@/types/analysis'
import {
  listProjectFiles,
  uploadProjectFile,
  deleteProjectFile,
  getSignedUrl,
  downloadProjectFileAsBlob,
} from '@/lib/projectFiles'

const STEM_ROLES: StemRole[] = ['full_mix', 'drums', 'bass', 'lead', 'music', 'fx']

const ACCEPT = '.wav,.mp3,.aif,.aiff,.flac,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/aiff,audio/x-aiff,audio/flac,audio/ogg'

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDuration(s: number | null): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

async function getAudioDuration(file: File): Promise<number | null> {
  try {
    const ab = await file.arrayBuffer()
    const ctx = new AudioContext()
    const buf = await ctx.decodeAudioData(ab)
    await ctx.close()
    return buf.duration
  } catch {
    return null
  }
}

interface Props {
  projectId: string
  userId: string
  onFileSelected: (file: File, storagePath: string) => void
  selectedStoragePath: string | null
}

export default function ProjectFilesPanel({ projectId, userId, onFileSelected, selectedStoragePath }: Props) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<StemRole | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [loadingSelect, setLoadingSelect] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listProjectFiles(projectId)
      setFiles(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleUpload(role: StemRole, file: File) {
    setUploading(role)
    setError(null)
    try {
      const duration = await getAudioDuration(file)
      const pf = await uploadProjectFile(userId, projectId, role, file, duration)
      setFiles((prev) => {
        const without = prev.filter((f) => f.role !== role)
        return [...without, pf].sort((a, b) =>
          STEM_ROLES.indexOf(a.role as StemRole) - STEM_ROLES.indexOf(b.role as StemRole)
        )
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  async function handleDelete(pf: ProjectFile) {
    setDeleting(pf.id)
    setError(null)
    if (playingId === pf.id) stopAudio()
    try {
      await deleteProjectFile(pf)
      setFiles((prev) => prev.filter((f) => f.id !== pf.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  async function handlePlay(pf: ProjectFile) {
    if (playingId === pf.id) { stopAudio(); return }
    stopAudio()
    setLoadingAudio(pf.id)
    try {
      const url = await getSignedUrl(pf.storage_path)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlayingId(null)
      await audio.play()
      setPlayingId(pf.id)
    } catch {
      setError('Could not play file')
    } finally {
      setLoadingAudio(null)
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }

  useEffect(() => () => stopAudio(), [])

  async function handleSelect(pf: ProjectFile) {
    setLoadingSelect(pf.id)
    setError(null)
    try {
      const blob = await downloadProjectFileAsBlob(pf.storage_path)
      const file = new File([blob], pf.label, { type: pf.mime_type })
      onFileSelected(file, pf.storage_path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load file for analysis')
    } finally {
      setLoadingSelect(null)
    }
  }

  const fileByRole = (role: StemRole) => files.find((f) => f.role === role) ?? null

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs text-white/40 uppercase tracking-widest">Project Files</span>
        {loading && <span className="text-xs text-white/25">Loading…</span>}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-[#dd6974] bg-[#dd6974]/10 border-b border-white/5">
          {error}
        </div>
      )}

      <div className="divide-y divide-white/5">
        {STEM_ROLES.map((role) => {
          const pf = fileByRole(role)
          const isUploading = uploading === role
          const isDeleting = deleting === pf?.id
          const isPlaying = playingId === pf?.id
          const isLoadingAudio = loadingAudio === pf?.id
          const isLoadingSelect = loadingSelect === pf?.id
          const isSelected = pf != null && pf.storage_path === selectedStoragePath

          return (
            <div key={role} className="flex items-center gap-3 px-4 py-3">
              <div className="w-28 shrink-0">
                <span className="text-xs text-white/50">{STEM_ROLE_LABELS[role]}</span>
              </div>

              {pf ? (
                <div className={`flex-1 flex items-center gap-2 min-w-0 rounded-lg px-3 py-2 transition-colors ${
                  isSelected ? 'bg-[#4f98a3]/15 border border-[#4f98a3]/30' : 'bg-white/[0.03] border border-white/8'
                }`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">{pf.label}</p>
                    <p className="text-[11px] text-white/30 font-mono mt-0.5">
                      {fmtSize(pf.size_bytes)}{pf.duration_seconds != null ? ` · ${fmtDuration(pf.duration_seconds)}` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => handlePlay(pf)}
                    disabled={isLoadingAudio || isDeleting}
                    title={isPlaying ? 'Stop' : 'Preview'}
                    className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-30 shrink-0"
                    aria-label={isPlaying ? 'Stop preview' : 'Preview file'}
                  >
                    {isLoadingAudio ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <circle cx="7" cy="7" r="5" strokeDasharray="8 24" className="animate-spin" style={{ transformOrigin: '7px 7px' }} />
                      </svg>
                    ) : isPlaying ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <rect x="3" y="3" width="3" height="8" rx="1" />
                        <rect x="8" y="3" width="3" height="8" rx="1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                        <path d="M4 2.5l8 4.5-8 4.5z" />
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={() => handleSelect(pf)}
                    disabled={isLoadingSelect || isDeleting}
                    title={isSelected ? 'Selected for analysis' : 'Use for analysis'}
                    className={`text-xs px-2 py-1 rounded-md transition-colors disabled:opacity-40 shrink-0 ${
                      isSelected
                        ? 'bg-[#4f98a3]/20 text-[#4f98a3]'
                        : 'text-white/40 hover:text-white/80 hover:bg-white/8'
                    }`}
                  >
                    {isLoadingSelect ? '…' : isSelected ? '✓' : 'Use'}
                  </button>

                  <button
                    onClick={() => handleDelete(pf)}
                    disabled={isDeleting || isLoadingSelect}
                    title="Delete file"
                    className="text-white/20 hover:text-[#dd6974] transition-colors disabled:opacity-30 shrink-0"
                    aria-label="Delete file"
                  >
                    {isDeleting ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <circle cx="6" cy="6" r="4" strokeDasharray="6 20" className="animate-spin" style={{ transformOrigin: '6px 6px' }} />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h8M5 3V2h2v1M4 3v6h4V3H4z" />
                      </svg>
                    )}
                  </button>
                </div>
              ) : (
                <label className={`flex-1 flex items-center gap-2 border border-dashed border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:border-white/25 transition-colors ${
                  isUploading ? 'opacity-50 pointer-events-none' : ''
                }`}>
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(role, f)
                      e.target.value = ''
                    }}
                  />
                  {isUploading ? (
                    <span className="text-xs text-white/30">Uploading…</span>
                  ) : (
                    <span className="text-xs text-white/25">+ Add {STEM_ROLE_LABELS[role]}</span>
                  )}
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
