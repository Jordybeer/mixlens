import { createClient } from '@/lib/supabase'
import type { ProjectFile, StemRole } from '@/types/analysis'

const BUCKET = 'audio-files'
const SIGNED_URL_TTL = 3600

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ProjectFile[]
}

export async function uploadProjectFile(
  userId: string,
  projectId: string,
  role: StemRole,
  file: File,
  durationSeconds: number | null,
): Promise<ProjectFile> {
  const supabase = createClient()
  const ext = file.name.split('.').pop() ?? 'audio'
  const fileId = crypto.randomUUID()
  const storagePath = `${userId}/${projectId}/${fileId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error: insertError } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      user_id: userId,
      role,
      label: file.name,
      storage_path: storagePath,
      mime_type: file.type || 'audio/mpeg',
      size_bytes: file.size,
      duration_seconds: durationSeconds,
    })
    .select('*')
    .single()

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw new Error(insertError.message)
  }

  return data as ProjectFile
}

export async function deleteProjectFile(pf: ProjectFile): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([pf.storage_path])
  const { error } = await supabase.from('project_files').delete().eq('id', pf.id)
  if (error) throw new Error(error.message)
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not create signed URL')
  return data.signedUrl
}

export async function downloadProjectFileAsBlob(storagePath: string): Promise<Blob> {
  const url = await getSignedUrl(storagePath)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.blob()
}
