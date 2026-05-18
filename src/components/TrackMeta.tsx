import type { AnalysisResult } from '@/types/analysis'
import { formatTime, estimateLUFS } from '@/lib/audioAnalysis'

interface Props {
  result: AnalysisResult
}

export default function TrackMeta({ result }: Props) {
  const lufs = estimateLUFS(result.energyCurve)

  const lufsColor =
    lufs === null ? 'text-white/50'
    : lufs >= -14 ? 'text-[#dd6974]'
    : lufs >= -18 ? 'text-[#e8af34]'
    : lufs >= -23 ? 'text-[#6daa45]'
    : 'text-white/50'

  return (
    <div className="space-y-4">
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
        {lufs !== null && (
          <span className={`text-xs bg-white/8 border border-white/10 rounded-full px-3 py-1 font-mono ${lufsColor}`}>
            {lufs} LUFS
          </span>
        )}
        {result.sections.map((s) => (
          <span key={s.startSeconds} className="text-xs bg-white/5 border border-white/10 rounded-full px-3 py-1 text-white/50">
            {s.label} {formatTime(s.startSeconds)}
          </span>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-2">✦ Overall Summary</p>
        <p className="text-sm text-white/80 leading-relaxed">{result.summary}</p>
      </div>
    </div>
  )
}
