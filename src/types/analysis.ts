export type Severity = 'VALIDATION' | 'MINOR' | 'IMPORTANT' | 'CRITICAL'

export interface FeedbackItem {
  id: string
  timestamp: number | null
  severity: Severity
  observation: string
  feedback: string
  status: 'pending' | 'todo' | 'ignored'
}

export interface AnalysisResult {
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  summary: string
  feedbackItems: FeedbackItem[]
}

export interface HistoryEntry {
  id: string
  fileName: string
  analysedAt: number // timestamp ms
  result: AnalysisResult
}

export interface Section {
  label: string
  startSeconds: number
  endSeconds: number
}

export interface EnergyPoint {
  time: number
  rms: number
}
