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
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<StemRole>('full_mix')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    const data = await listProjectFiles(projectId)
    setFiles(data)
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const duration = await getAudioDuration(file)
      const uploaded = await uploadProjectFile(userId, projectId, pendingRole, file, duration)
      setFiles((prev) => [uploaded, ...prev])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(file: ProjectFile) {
    setDeletingId(file.id)
    await deleteProjectFile(file)
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
    if (previewId === file.id) { setPreviewUrl(null); setPreviewId(null) }
    setDeletingId(null)
  }

  async function handlePreview(file: ProjectFile) {
    if (previewId === file.id) { setPreviewUrl(null); setPreviewId(null); return }
    const url = await getSignedUrl(file.storage_path)
    if (url) { setPreviewUrl(url); setPreviewId(file.id) }
  }

  async function handleSelect(file: ProjectFile) {
    const blob = await downloadProjectFileAsBlob(file.storage_path)
    if (!blob) return
    const displayName = (file as unknown as Record<string, unknown>).label as string | undefined
      ?? file.storage_path.split('/').pop()
      ?? 'audio'
    const f = new File([blob], displayName, { type: blob.type || 'audio/mpeg' })
    onFileSelected(f, file.storage_path)
  }

  function fileName(file: ProjectFile): string {
    const f = file as unknown as Record<string, unknown>
    return (f.file_name ?? f.label ?? file.storage_path.split('/').pop() ?? '') as string
  }
  function fileSize(file: ProjectFile): number {
    const f = file as unknown as Record<string, unknown>
    return ((f.file_size_bytes ?? f.size_bytes ?? 0) as number)
  }

  return (
    <div className="space-y-3">
      {/* Upload row */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={pendingRole}
          onChange={(e) => setPendingRole(e.target.value as StemRole)}
          className="text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          {STEM_ROLES.map((r) => (
            <option key={r} value={r}>{STEM_ROLE_LABELS[r]}</option>
          ))}
        </select>
        <label className="cursor-pointer">
          <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleUpload} />
          <span className="text-xs px-3 py-1.5 rounded-lg border transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {uploading ? 'Bezig met uploaden…' : '+ Bestand uploaden'}
          </span>
        </label>
      </div>

      {uploadError && (
        <div className="px-4 py-2 text-xs rounded-lg"
          style={{ color: 'var(--sev-important)', background: 'color-mix(in srgb, var(--sev-important) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sev-important) 25%, transparent)' }}>
          {uploadError}
        </div>
      )}

      {loading ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-faint)' }}>Bestanden laden…</div>
      ) : files.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-faint)' }}>
          Nog geen bestanden. Upload je eerste audiobestand hierboven.
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => {
            const isSelected = file.storage_path === selectedStoragePath
            const isDeleting = deletingId === file.id
            const isPreviewing = previewId === file.id

            return (
              <li
                key={file.id}
                className={`rounded-xl p-3 transition-all ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                style={isSelected
                  ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }
                  : { background: 'var(--bg-surface)', border: '1px solid var(--border)' }
                }
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelect(file)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm truncate font-medium" style={{ color: 'var(--text)' }}>{fileName(file)}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{STEM_ROLE_LABELS[file.role]}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{fmtSize(fileSize(file))}</span>
                      {file.duration_seconds && (
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>{fmtDuration(file.duration_seconds)}</span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handlePreview(file)}
                      title={isPreviewing ? 'Preview stoppen' : 'Voorbeluisteren'}
                      className="text-[10px] transition-opacity hover:opacity-70"
                      style={isPreviewing
                        ? { color: 'var(--accent)' }
                        : { color: 'var(--text-faint)' }
                      }
                    >
                      {isPreviewing ? '■' : '▶'}
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={isDeleting}
                      className="transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      {isDeleting ? '…' : '×'}
                    </button>
                  </div>
                </div>

                {isPreviewing && previewUrl && (
                  <audio
                    src={previewUrl}
                    autoPlay
                    controls
                    className="mt-2 w-full h-8"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
