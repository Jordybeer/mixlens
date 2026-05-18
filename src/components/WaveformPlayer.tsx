'use client'

import { useEffect, useRef, useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { Section } from '@/types/analysis'

interface Props {
  url: string
  sections?: Section[]
  duration?: number
}

export default function WaveformPlayer({ url, sections = [], duration = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const { seekTo, setSeekTo, setAudioTime } = useAnalysisStore()

  useEffect(() => {
    if (!containerRef.current) return
    setReady(false)
    setPlaying(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null

    import('wavesurfer.js').then(({ default: WaveSurfer }) => {
      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: 'rgba(255,255,255,0.15)',
        progressColor: '#4f98a3',
        cursorColor: '#4f98a3',
        height: 56,
        barWidth: 2,
        barGap: 1,
        barRoundness: 2,
        url,
      })

      ws.on('ready', () => setReady(true))
      ws.on('play', () => setPlaying(true))
      ws.on('pause', () => { setPlaying(false); setAudioTime(ws.getCurrentTime()) })
      ws.on('finish', () => setPlaying(false))
      ws.on('timeupdate', (t: number) => setAudioTime(t))
      ws.on('interaction', () => setAudioTime(ws.getCurrentTime()))

      wsRef.current = ws
    })

    return () => {
      ws?.destroy()
      wsRef.current = null
      setAudioTime(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  useEffect(() => {
    if (seekTo !== null && wsRef.current && duration > 0) {
      wsRef.current.seekTo(Math.min(seekTo / duration, 1))
      setSeekTo(null)
    }
  }, [seekTo, duration, setSeekTo])

  function handlePlayPause() { wsRef.current?.playPause() }
  function handleRewind() { wsRef.current?.seekTo(0); setAudioTime(0) }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={containerRef} className="rounded-lg overflow-hidden bg-white/5 px-2 pt-1 pb-0" />
        {duration > 0 && sections.map((s) => (
          <div
            key={s.startSeconds}
            className="absolute top-0 h-full flex flex-col justify-end pb-1 pointer-events-none"
            style={{ left: `${(s.startSeconds / duration) * 100}%` }}
          >
            <div className="w-px h-full bg-white/20 absolute top-0" />
            <span className="text-[10px] text-white/40 ml-1 relative z-10">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRewind}
          disabled={!ready}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Rewind to start"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-white/60">
            <path d="M1 2h1.5v10H1V2zm10.5 0l-7 5 7 5V2z"/>
          </svg>
        </button>

        <button
          onClick={handlePlayPause}
          disabled={!ready}
          className="w-9 h-9 flex items-center justify-center rounded-md bg-[#4f98a3]/20 hover:bg-[#4f98a3]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-[#4f98a3]">
              <rect x="2" y="2" width="4" height="10" rx="1"/>
              <rect x="8" y="2" width="4" height="10" rx="1"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-[#4f98a3]">
              <path d="M3 2l10 5-10 5V2z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
