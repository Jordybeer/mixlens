'use client'

import { useEffect, useRef, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function WaveformPlayer() {
  const { audioFile, seekTo, setSeekTo } = useAnalysisStore()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!audioFile) { setUrl(null); return }
    const u = URL.createObjectURL(audioFile)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [audioFile])

  useEffect(() => {
    if (seekTo === null || !audioRef.current) return
    audioRef.current.currentTime = seekTo
    audioRef.current.play().catch(() => {})
    setPlaying(true)
    setSeekTo(null)
  }, [seekTo, setSeekTo])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().catch(() => {}); setPlaying(true) }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  if (!url) return null

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />

      <button
        onClick={togglePlay}
        className="w-9 h-9 flex items-center justify-center rounded-md transition-colors shrink-0"
        style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
        aria-label={playing ? 'Pauzeren' : 'Afspelen'}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3 1.5l9 5.5-9 5.5V1.5z" />
          </svg>
        )}
      </button>

      <span className="text-xs font-mono shrink-0 w-10 text-right" style={{ color: 'var(--text-faint)' }}>
        {formatTime(currentTime)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="flex-1 h-1"
        style={{ accentColor: 'var(--accent)' }}
      />

      <span className="text-xs font-mono shrink-0 w-10" style={{ color: 'var(--text-faint)' }}>
        {formatTime(duration)}
      </span>
    </div>
  )
}
