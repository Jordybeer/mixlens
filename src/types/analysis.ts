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

// ---- Version comparison types ----

export type DiffTag = 'improved' | 'regression' | 'new_issue' | 'resolved' | 'unchanged'

export interface CompareItem {
  id: string
  tag: DiffTag
  area: string          // e.g. "Low-mids", "Dynamic range", "Drop energy"
  v1: string            // what it was
  v2: string            // what it is now
  verdict: string       // actionable one-liner
}

export interface CompareResult {
  summary: string
  overallVerdict: 'better' | 'worse' | 'mixed' | 'neutral'
  items: CompareItem[]
}
