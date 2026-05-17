export type Severity = 'VALIDATION' | 'MINOR' | 'IMPORTANT' | 'CRITICAL'

export interface FeedbackItem {
  id: string
  timestamp: number | null // seconds into track, null = overall
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

export interface Section {
  label: string // e.g. 'intro', 'build', 'drop', 'breakdown', 'outro'
  startSeconds: number
  endSeconds: number
}

export interface EnergyPoint {
  time: number // seconds
  rms: number  // 0–1
}
