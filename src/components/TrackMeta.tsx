'use client'

import { useAnalysisStore } from '@/store/useAnalysisStore'
import { formatTime } from '@/lib/audioAnalysis'

function lufsStyle(lufs: number | null | undefined): React.CSSProperties {
  if (lufs == null) return { color: 'var(--text-faint)' }
  if (lufs > -8)   return { color: 'var(--sev-critical)' }
  if (lufs >= -14) return { color: 'var(--sev-important)' }
  if (lufs >= -18) return { color: 'var(--sev-important)' }
  if (lufs >= -23) return { color: 'var(--sev-minor)' }
  return { color: 'var(--text-faint)' }
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
          className="text-xs font-mono rounded-full px-3 py-1"
          style={{ color: 'var(--text)', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {p}
        </span>
      ))}
      {lufs != null && (
        <span
          className="text-xs font-mono rounded-full px-3 py-1"
          style={{ border: '1px solid var(--border)', ...lufsStyle(lufs) }}
        >
          {lufs.toFixed(1)} LUFS
        </span>
      )}
    </div>
  )
}
