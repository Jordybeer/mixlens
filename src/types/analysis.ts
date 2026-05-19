export type Severity = 'CRITICAL' | 'IMPORTANT' | 'MINOR' | 'VALIDATION'

export type FeedbackCategory =
  | 'Low End'
  | 'Mix Balance'
  | 'Arrangement'
  | 'Tension & Energy'
  | 'Dynamics'
  | 'Stereo Width'
  | 'Vocals / Lead'
  | 'Master Check'
  | 'Next Steps'

export interface StereoSummary {
  correlation: number
  midDbfs: number | null
  sideDbfs: number | null
  widthPercent: number
}

export interface FeedbackItem {
  id: string
  timestamp: number | null
  severity: Severity
  category: FeedbackCategory
  tags: string[]
  observation: string
  feedback: string
  confidence?: 'high' | 'medium' | 'low'
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
  lufs?: number | null
  stereo?: StereoSummary | null
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

export type StemRole = 'full_mix' | 'drums' | 'bass' | 'lead' | 'music' | 'fx'

export const STEM_ROLE_LABELS: Record<StemRole, string> = {
  full_mix: 'Full Mix',
  drums: 'Drums',
  bass: 'Bass',
  lead: 'Lead / Vocal',
  music: 'Music / Synths',
  fx: 'FX / Atmosphere',
}

export interface ProjectFile {
  id: string
  project_id: string
  user_id: string
  role: StemRole
  label: string
  storage_path: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  created_at: string
}
