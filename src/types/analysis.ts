export type Severity = 'VALIDATION' | 'MINOR' | 'IMPORTANT' | 'CRITICAL'

export interface FeedbackItem {
  id: string
  timestamp: number | null
  severity: Severity
  observation: string
  feedback: string
  status: 'pending' | 'todo' | 'ignored'
}

export interface FFTBand {
  freq: number  // Hz
  db: number    // dBFS, clamped to -80
}

export interface AnalysisResult {
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  fftSpectrum: FFTBand[]
  summary: string
  feedbackItems: FeedbackItem[]
}

export interface HistoryEntry {
  id: string
  fileName: string
  analysedAt: number
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
