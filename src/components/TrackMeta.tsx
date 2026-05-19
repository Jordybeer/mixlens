'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'

function lufsColor(lufs: number | null | undefined): string {
  if (lufs == null) return 'text-white/40'
  return lufs > -8
    ? 'text-[var(--color-notification)]'
    : lufs >= -14 ? 'text-[var(--color-notification)]'
    : lufs >= -18 ? 'text-[var(--color-gold)]'
    : lufs >= -23 ? 'text-[var(--color-success)]'
    : 'text-white/40'
}

export default function TrackMeta() {
  const { result } = useAnalysisStore()
  if (!result) return null

  const { bpm, key, durationSeconds, lufs } = result

  const pills = [
    bpm ? `${bpm} BPM` : null,
    key ?? null,
    durationSeconds ? formatTime(durationSeconds) : null,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((p) => (
        <span
          key={p}
          className="text-xs font-mono text-white/50 border border-white/10 rounded-full px-3 py-1"
        >
          {p}
        </span>
      ))}
      {lufs != null && (
        <span className={`text-xs font-mono border border-white/10 rounded-full px-3 py-1 ${lufsColor(lufs)}`}>
          {lufs.toFixed(1)} LUFS
        </span>
      )}
    </div>
  )
}
