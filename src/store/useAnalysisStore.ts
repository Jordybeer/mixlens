import { create } from 'zustand'
import type { AnalysisResult, FeedbackItem, Severity } from '@/types/analysis'

interface AnalysisStore {
  audioFile: File | null
  audioUrl: string | null
  isAnalysing: boolean
  result: AnalysisResult | null
  customQuestion: string
  severityFilter: Severity | 'ALL'
  seekTo: number | null

  setAudioFile: (file: File) => void
  setIsAnalysing: (v: boolean) => void
  setResult: (r: AnalysisResult) => void
  setCustomQuestion: (q: string) => void
  setSeverityFilter: (f: Severity | 'ALL') => void
  setSeekTo: (t: number | null) => void
  updateFeedbackStatus: (id: string, status: FeedbackItem['status']) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  audioFile: null,
  audioUrl: null,
  isAnalysing: false,
  result: null,
  customQuestion: '',
  severityFilter: 'ALL',
  seekTo: null,

  setAudioFile: (file) => {
    const url = URL.createObjectURL(file)
    set({ audioFile: file, audioUrl: url, result: null })
  },
  setIsAnalysing: (v) => set({ isAnalysing: v }),
  setResult: (r) => set({ result: r }),
  setCustomQuestion: (q) => set({ customQuestion: q }),
  setSeverityFilter: (f) => set({ severityFilter: f }),
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
}))
