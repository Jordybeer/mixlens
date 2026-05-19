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
      // signature: uploadProjectFile(userId, projectId, role, file, durationSeconds)
      const uploaded = await uploadProjectFile(userId, projectId, pendingRole, file, duration)
      setFiles((prev) => [uploaded, ...prev])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
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
    // downloadProjectFileAsBlob takes storage_path string
    const blob = await downloadProjectFileAsBlob(file.storage_path)
    if (!blob) return
    // ProjectFile uses `label` for the display name (mapped from DB)
    const displayName = (file as unknown as Record<string, unknown>).label as string | undefined
      ?? file.storage_path.split('/').pop()
      ?? 'audio'
    const f = new File([blob], displayName, { type: blob.type || 'audio/mpeg' })
    onFileSelected(f, file.storage_path)
  }

  // Field name helpers — DB returns `label` and `size_bytes`; type may expose them differently
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
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/60 focus:outline-none"
        >
          {STEM_ROLES.map((r) => (
            <option key={r} value={r}>{STEM_ROLE_LABELS[r]}</option>
          ))}
        </select>
        <label className="cursor-pointer">
          <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleUpload} />
          <span className="text-xs px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30 transition-colors text-white/50 hover:text-white/80">
            {uploading ? 'Uploading…' : '+ Upload file'}
          </span>
        </label>
      </div>

      {uploadError && (
        <div className="px-4 py-2 text-xs text-[var(--color-notification)] bg-[var(--color-notification)]/10 border-b border-[var(--color-notification)]/20 rounded-lg">
          {uploadError}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-white/25 py-4 text-center">Loading files…</div>
      ) : files.length === 0 ? (
        <div className="text-xs text-white/25 py-4 text-center">No files yet. Upload your first audio file above.</div>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => {
            const isSelected = file.storage_path === selectedStoragePath
            const isDeleting = deletingId === file.id
            const isPreviewing = previewId === file.id

            return (
              <li
                key={file.id}
                className={`rounded-xl p-3 transition-all ${
                  isSelected
                    ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30'
                    : 'bg-white/[0.03] border border-white/8 hover:border-white/15'
                } ${
                  isDeleting ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelect(file)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm text-white/80 truncate font-medium">{fileName(file)}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-white/30">{STEM_ROLE_LABELS[file.role]}</span>
                      <span className="text-[10px] text-white/25">{fmtSize(fileSize(file))}</span>
                      {file.duration_seconds && (
                        <span className="text-[10px] text-white/25 font-mono">{fmtDuration(file.duration_seconds)}</span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handlePreview(file)}
                      title={isPreviewing ? 'Stop preview' : 'Preview'}
                      className={`text-[10px] transition-colors ${
                        isPreviewing
                          ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                          : 'text-white/25 hover:text-white/60'
                      }`}
                    >
                      {isPreviewing ? '■' : '▶'}
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={isDeleting}
                      className="text-white/20 hover:text-[var(--color-notification)] transition-colors disabled:opacity-40"
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
                    style={{ accentColor: 'var(--color-primary)' }}
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
