'use client'

import { useEffect, useRef } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import type { Section } from '@/types/analysis'
import { formatTime } from '@/lib/audioAnalysis'

interface Props {
  url: string
  sections?: Section[]
  duration?: number
}

export default function WaveformPlayer({ url, sections = [], duration = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<{ destroy: () => void; playPause: () => void; seekTo: (p: number) => void } | null>(null)
  const { seekTo, setSeekTo, setAudioTime } = useAnalysisStore()

  useEffect(() => {
    if (!containerRef.current) return
    let ws: typeof wsRef.current = null
    import('wavesurfer.js').then(({ default: WaveSurfer }) => {
      const instance = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: 'rgba(255,255,255,0.15)',
        progressColor: '#4f98a3',
        cursorColor: '#4f98a3',
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        url,
      })

      // Emit live time to store
      instance.on('audioprocess', (t: number) => setAudioTime(t))
      // 'interaction' fires on user click/seek in WaveSurfer v7 (replaces 'seek')
      instance.on('interaction', () => {
        const t = instance.getCurrentTime ? instance.getCurrentTime() : 0
        setAudioTime(t)
      })
      instance.on('pause', () => {
        const t = instance.getCurrentTime ? instance.getCurrentTime() : 0
        setAudioTime(t)
      })

      ws = instance
      wsRef.current = instance
    })
    return () => { ws?.destroy(); setAudioTime(0) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Seek when store seekTo changes
  useEffect(() => {
    if (seekTo !== null && wsRef.current && duration > 0) {
      wsRef.current.seekTo(Math.min(seekTo / duration, 1))
      setSeekTo(null)
    }
  }, [seekTo, duration, setSeekTo])

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={containerRef} className="rounded-lg overflow-hidden bg-white/5 px-2 py-1" />
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
      <button
        onClick={() => wsRef.current?.playPause()}
        className="text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Play / Pause
      </button>
    </div>
  )
}
