'use client'

import { useEffect, useRef } from 'react'

interface Props {
  url: string
}

export default function WaveformPlayer({ url }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let ws: { destroy: () => void; playPause: () => void } | null = null

    import('wavesurfer.js').then(({ default: WaveSurfer }) => {
      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: 'rgba(255,255,255,0.2)',
        progressColor: '#4f98a3',
        cursorColor: '#4f98a3',
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        url,
      })
      wsRef.current = ws
    })

    return () => { ws?.destroy() }
  }, [url])

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="rounded-lg overflow-hidden bg-white/5 px-2 py-1" />
      <button
        onClick={() => (wsRef.current as { playPause: () => void } | null)?.playPause()}
        className="text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        ▶ Play / Pause
      </button>
    </div>
  )
}
