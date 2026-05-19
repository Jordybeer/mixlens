import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult, FeedbackItem, Severity, CostEstimate } from '@/types/analysis'
import type { Section } from '@/types/analysis'

// LeanHistoryEntry kept for loadFromHistory shape (loaded from Supabase, not localStorage)
export interface LeanHistoryEntry {
  id: string
  fileName: string
  analysedAt: number
  bpm: number | null
  key: string | null
  durationSeconds: number
  summary: string
  feedbackItems: FeedbackItem[]
  sections: AnalysisResult['sections']
  costEstimate?: CostEstimate
  isDeepScan?: boolean
  audioStoragePath?: string | null
}

interface AnalysisStore {
  audioFile: File | null
  audioUrl: string | null
  isAnalysing: boolean
  result: AnalysisResult | null
  error: string | null
  customQuestion: string
  severityFilter: Severity | 'ALL'
  todoFilter: boolean
  seekTo: number | null
  audioTime: number
  userSections: Section[] | null
  totalSpentUsd: number
  feedbackStatusMap: Record<string, FeedbackItem['status']>

  setAudioFile: (file: File) => void
  setIsAnalysing: (v: boolean) => void
  setResult: (r: AnalysisResult, fileName: string) => void
  setError: (e: string | null) => void
  setCustomQuestion: (q: string) => void
  setSeverityFilter: (f: Severity | 'ALL') => void
  setTodoFilter: (v: boolean) => void
  setSeekTo: (t: number | null) => void
  setAudioTime: (t: number) => void
  setUserSections: (sections: Section[]) => void
  updateFeedbackStatus: (id: string, status: FeedbackItem['status']) => void
  loadFromHistory: (entry: LeanHistoryEntry) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set) => ({
      audioFile: null,
      audioUrl: null,
      isAnalysing: false,
      result: null,
      error: null,
      customQuestion: '',
      severityFilter: 'ALL',
      todoFilter: false,
      seekTo: null,
      audioTime: 0,
      userSections: null,
      totalSpentUsd: 0,
      feedbackStatusMap: {},

      setAudioFile: (file) => {
        const url = URL.createObjectURL(file)
        set({ audioFile: file, audioUrl: url, result: null, error: null, userSections: null, audioTime: 0 })
      },
      setIsAnalysing: (v) => set({ isAnalysing: v }),
      setResult: (r, _fileName) => set((state) => ({
        result: {
          ...r,
          feedbackItems: r.feedbackItems.map((item) => ({
            ...item,
            status: state.feedbackStatusMap[item.id] ?? item.status,
          })),
        },
        error: null,
        userSections: null,
        totalSpentUsd: state.totalSpentUsd + (r.costEstimate?.totalCostUsd ?? 0),
      })),
      setError: (e) => set({ error: e }),
      setCustomQuestion: (q) => set({ customQuestion: q }),
      setSeverityFilter: (f) => set({ severityFilter: f }),
      setTodoFilter: (v) => set({ todoFilter: v }),
      setSeekTo: (t) => set({ seekTo: t }),
      setAudioTime: (t) => set({ audioTime: t }),
      setUserSections: (sections) => set({ userSections: sections }),
      updateFeedbackStatus: (id, status) =>
        set((state) => ({
          feedbackStatusMap: { ...state.feedbackStatusMap, [id]: status },
          result: state.result
            ? {
                ...state.result,
                feedbackItems: state.result.feedbackItems.map((item) =>
                  item.id === id ? { ...item, status } : item
                ),
              }
            : null,
        })),
      loadFromHistory: (entry) => set((state) => ({
        result: {
          bpm: entry.bpm,
          key: entry.key,
          durationSeconds: entry.durationSeconds,
          summary: entry.summary,
          feedbackItems: (entry.feedbackItems ?? []).map((item) => ({
            ...item,
            status: state.feedbackStatusMap[item.id] ?? item.status,
          })),
          sections: entry.sections ?? [],
          energyCurve: [],
          fftSpectrum: [],
          costEstimate: entry.costEstimate,
          isDeepScan: entry.isDeepScan,
        },
        userSections: (entry.sections ?? []).length > 0 ? entry.sections : null,
        audioFile: null,
        audioUrl: null,
        audioTime: 0,
        error: null,
      })),
      reset: () => set({
        audioFile: null, audioUrl: null, result: null, error: null,
        customQuestion: '', seekTo: null, audioTime: 0, userSections: null,
      }),
    }),
    {
      name: 'mixlens-store',
      // history removed — Supabase is source of truth now
      partialize: (state) => ({
        customQuestion: state.customQuestion,
        userSections: state.userSections,
        totalSpentUsd: state.totalSpentUsd,
        feedbackStatusMap: state.feedbackStatusMap,
      }),
    }
  )
)
