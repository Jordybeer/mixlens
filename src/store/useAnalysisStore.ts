import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult, FeedbackItem, Severity } from '@/types/analysis'

interface AnalysisStore {
  audioFile: File | null
  audioUrl: string | null
  isAnalysing: boolean
  result: AnalysisResult | null
  customQuestion: string
  severityFilter: Severity | 'ALL'
  todoFilter: boolean
  seekTo: number | null

  setAudioFile: (file: File) => void
  setIsAnalysing: (v: boolean) => void
  setResult: (r: AnalysisResult) => void
  setCustomQuestion: (q: string) => void
  setSeverityFilter: (f: Severity | 'ALL') => void
  setTodoFilter: (v: boolean) => void
  setSeekTo: (t: number | null) => void
  updateFeedbackStatus: (id: string, status: FeedbackItem['status']) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    (set) => ({
      audioFile: null,
      audioUrl: null,
      isAnalysing: false,
      result: null,
      customQuestion: '',
      severityFilter: 'ALL',
      todoFilter: false,
      seekTo: null,

      setAudioFile: (file) => {
        const url = URL.createObjectURL(file)
        set({ audioFile: file, audioUrl: url, result: null })
      },
      setIsAnalysing: (v) => set({ isAnalysing: v }),
      setResult: (r) => set({ result: r }),
      setCustomQuestion: (q) => set({ customQuestion: q }),
      setSeverityFilter: (f) => set({ severityFilter: f }),
      setTodoFilter: (v) => set({ todoFilter: v }),
      setSeekTo: (t) => set({ seekTo: t }),
      updateFeedbackStatus: (id, status) =>
        set((state) => ({
          result: state.result
            ? {
                ...state.result,
                feedbackItems: state.result.feedbackItems.map((item) =>
                  item.id === id ? { ...item, status } : item
                ),
              }
            : null,
        })),
      reset: () => set({ audioFile: null, audioUrl: null, result: null, customQuestion: '', seekTo: null }),
    }),
    {
      name: 'mixlens-store',
      partialize: (state) => ({
        result: state.result,
        customQuestion: state.customQuestion,
      }),
    }
  )
)
