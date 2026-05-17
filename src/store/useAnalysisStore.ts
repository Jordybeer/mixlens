import { create } from 'zustand'
import type { AnalysisResult, FeedbackItem } from '@/types/analysis'

interface AnalysisStore {
  audioFile: File | null
  audioUrl: string | null
  isAnalysing: boolean
  result: AnalysisResult | null
  customQuestion: string

  setAudioFile: (file: File) => void
  setIsAnalysing: (v: boolean) => void
  setResult: (r: AnalysisResult) => void
  setCustomQuestion: (q: string) => void
  updateFeedbackStatus: (id: string, status: FeedbackItem['status']) => void
  reset: () => void
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  audioFile: null,
  audioUrl: null,
  isAnalysing: false,
  result: null,
  customQuestion: '',

  setAudioFile: (file) => {
    const url = URL.createObjectURL(file)
    set({ audioFile: file, audioUrl: url, result: null })
  },
  setIsAnalysing: (v) => set({ isAnalysing: v }),
  setResult: (r) => set({ result: r }),
  setCustomQuestion: (q) => set({ customQuestion: q }),
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
  reset: () => set({ audioFile: null, audioUrl: null, result: null, customQuestion: '' }),
}))
