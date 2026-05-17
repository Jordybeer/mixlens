import type { AnalysisResult } from '@/types/analysis'
import { formatTime } from '@/lib/audioAnalysis'

interface Props {
  result: AnalysisResult
}

export default function TrackMeta({ result }: Props) {
  return (
    <div className="space-y-4">
      {/* Meta pills */}
      <div className="flex flex-wrap gap-2">
        {result.bpm && (
          <span className="text-xs bg-white/8 border border-white/10 rounded-full px-3 py-1 font-mono">
            {result.bpm} BPM
          </span>
        )}
        {result.key && (
          <span className="text-xs bg-white/8 border border-white/10 rounded-full px-3 py-1 font-mono">
            {result.key}
          </span>
        )}
        <span className="text-xs bg-white/8 border border-white/10 rounded-full px-3 py-1 font-mono">
          {formatTime(result.durationSeconds)}
        </span>
        {result.sections.map((s) => (
          <span key={s.startSeconds} className="text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1 text-white/50">
            {s.label} {formatTime(s.startSeconds)}
          </span>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-2">✦ Overall Summary</p>
        <p className="text-sm text-white/80 leading-relaxed">{result.summary}</p>
      </div>
    </div>
  )
}
