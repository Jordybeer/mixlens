import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { FeedbackItem } from '@/types/analysis'
import type { LeanHistoryEntry } from '@/store/useAnalysisStore'

export interface ProjectAnalysis {
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

export function useProjectAnalyses(projectId: string | null) {
  const [analyses, setAnalyses] = useState<ProjectAnalysis[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!projectId) { setAnalyses([]); return }
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('analyses')
      .select('id, file_name, analysed_at, audio_storage_path, lean_result')
      .eq('project_id', projectId)
      .order('analysed_at', { ascending: false })
      .limit(50)
    if (!error && data) setAnalyses(data as ProjectAnalysis[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { refetch() }, [refetch])

  return { analyses, loading, refetch }
}
