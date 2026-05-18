export type Severity = 'CRITICAL' | 'IMPORTANT' | 'MINOR' | 'VALIDATION'

export interface FeedbackItem {
  id: string
  timestamp: number | null
  severity: Severity
  observation: string
  feedback: string
  status: 'pending' | 'todo' | 'ignored'
}

export interface EnergyPoint {
  time: number
  rms: number
}

export interface FFTBand {
  frequency: number
  amplitude: number
}

export interface Section {
  label: string
  startSeconds: number
  endSeconds: number
}

export interface CostEstimate {
  inputTokens: number
  outputTokens: number
  llmCostUsd: number
  infraCostUsd: number
  totalCostUsd: number
  model: string
}

export interface AnalysisResult {
  bpm: number | null
  key: string | null
  durationSeconds: number
  summary: string
  feedbackItems: FeedbackItem[]
  sections: Section[]
  energyCurve: EnergyPoint[]
  fftSpectrum: FFTBand[]
  costEstimate?: CostEstimate
}

export interface HistoryEntry {
  id: string
  fileName: string
  analysedAt: number
  result: AnalysisResult
}
