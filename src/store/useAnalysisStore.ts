import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnalysisResult, FeedbackItem, Severity } from '@/types/analysis'
import type { Section } from '@/types/analysis'

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
  audioTime: number           // live playback position in seconds
  userSections: Section[] | null  // user-edited arrangement (persists across nav)
  history: LeanHistoryEntry[]

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
  clearHistory: () => void
  reset: () => void
}

function toLean(r: AnalysisResult, fileName: string): LeanHistoryEntry {
  return {
    id: crypto.randomUUID(),
    fileName,
    analysedAt: Date.now(),
    bpm: r.bpm,
    key: r.key,
    durationSeconds: r.durationSeconds,
    summary: r.summary,
    feedbackItems: r.feedbackItems,
    sections: r.sections,
  }
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
      history: [],

      setAudioFile: (file) => {
        const url = URL.createObjectURL(file)
        set({ audioFile: file, audioUrl: url, result: null, error: null, userSections: null, audioTime: 0 })
      },
      setIsAnalysing: (v) => set({ isAnalysing: v }),
      setResult: (r, fileName) => set((state) => ({
        result: r,
        error: null,
        userSections: null, // reset arrangement on new analysis
        history: [
          toLean(r, fileName),
          ...state.history.slice(0, 19),
        ],
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
          result: state.result
            ? {
                ...state.result,
                feedbackItems: state.result.feedbackItems.map((item) =>
                  item.id === id ? { ...item, status } : item
                ),
              }
            : null,
        })),
      loadFromHistory: (entry) => set({
        result: {
          bpm: entry.bpm,
          key: entry.key,
          durationSeconds: entry.durationSeconds,
          summary: entry.summary,
          feedbackItems: entry.feedbackItems,
          sections: entry.sections,
          energyCurve: [],
          fftSpectrum: [],
        },
        userSections: entry.sections.length > 0 ? entry.sections : null,
        audioFile: null,
        audioUrl: null,
        audioTime: 0,
        error: null,
      }),
      clearHistory: () => set({ history: [] }),
      reset: () => set({
        audioFile: null, audioUrl: null, result: null, error: null,
        customQuestion: '', seekTo: null, audioTime: 0, userSections: null,
      }),
    }),
    {
      name: 'mixlens-store',
      partialize: (state) => ({
        customQuestion: state.customQuestion,
        history: state.history,
        userSections: state.userSections,
      }),
    }
  )
)
