import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult, FeedbackItem, Severity, HistoryEntry } from '@/types/analysis'

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
  history: HistoryEntry[]

  setAudioFile: (file: File) => void
  setIsAnalysing: (v: boolean) => void
  setResult: (r: AnalysisResult, fileName: string) => void
  setError: (e: string | null) => void
  setCustomQuestion: (q: string) => void
  setSeverityFilter: (f: Severity | 'ALL') => void
  setTodoFilter: (v: boolean) => void
  setSeekTo: (t: number | null) => void
  updateFeedbackStatus: (id: string, status: FeedbackItem['status']) => void
  loadFromHistory: (entry: HistoryEntry) => void
  clearHistory: () => void
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
      history: [],

      setAudioFile: (file) => {
        const url = URL.createObjectURL(file)
        set({ audioFile: file, audioUrl: url, result: null, error: null })
      },
      setIsAnalysing: (v) => set({ isAnalysing: v }),
      setResult: (r, fileName) => set((state) => ({
        result: r,
        error: null,
        history: [
          { id: crypto.randomUUID(), fileName, analysedAt: Date.now(), result: r },
          ...state.history.slice(0, 9), // keep last 10
        ],
      })),
      setError: (e) => set({ error: e }),
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
      loadFromHistory: (entry) => set({ result: entry.result, audioFile: null, audioUrl: null, error: null }),
      clearHistory: () => set({ history: [] }),
      reset: () => set({ audioFile: null, audioUrl: null, result: null, error: null, customQuestion: '', seekTo: null }),
    }),
    {
      name: 'mixlens-store',
      partialize: (state) => ({
        result: state.result,
        customQuestion: state.customQuestion,
        history: state.history,
      }),
    }
  )
)
