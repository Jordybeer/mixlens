export type Severity = 'CRITICAL' | 'IMPORTANT' | 'MINOR' | 'VALIDATION'

export type FeedbackCategory =
  | 'Low End'
  | 'Mix Balance'
  | 'Arrangement'
  | 'Tension & Energy'
  | 'Stereo Width'
  | 'Vocals / Lead'
  | 'Master Check'
  | 'Next Steps'

export interface FeedbackItem {
  id: string
  timestamp: number | null
  severity: Severity
  category: FeedbackCategory
  tags: string[]
  observation: string
  feedback: string
  status: 'pending' | 'todo' | 'ignored'
}

export interface EnergyPoint {
  time: number
  rms: number
}

export interface FFTBand {
  freq: number
  db: number
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
  isDeepScan?: boolean
}

export type DiffTag = 'improved' | 'regression' | 'new_issue' | 'resolved' | 'unchanged'

export interface CompareItem {
  id: string
  tag: DiffTag
  area: string
  v1: string
  v2: string
  verdict: string
}

export interface CompareResult {
  summary: string
  overallVerdict: 'better' | 'worse' | 'mixed' | 'neutral'
  items: CompareItem[]
}

export interface HistoryEntry {
  id: string
  fileName: string
  analysedAt: number
  result: AnalysisResult
}
