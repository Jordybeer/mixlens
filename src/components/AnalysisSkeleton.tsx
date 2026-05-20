'use client'
import { useState, useEffect } from 'react'

export default function AnalysisSkeleton({ step }: { step?: string | null }) {
  const [visible, setVisible] = useState(true)
  const [displayed, setDisplayed] = useState(step)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => { setDisplayed(step); setVisible(true) }, 150)
    return () => clearTimeout(t)
  }, [step])

  return (
    <div className="space-y-6">
      {displayed && (
        <p
          className="text-xs text-center"
          style={{ color: 'var(--accent)', opacity: visible ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          {displayed}
        </p>
      )}
      <div className="space-y-6 animate-pulse">
        {/* Meta pills skeleton */}
        <div className="flex gap-2">
          {[60, 48, 40].map((w) => (
            <div key={w} className="h-6 rounded-full" style={{ width: w, background: 'var(--overlay-medium)' }} />
          ))}
        </div>
        {/* Summary skeleton */}
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--overlay-subtle)', border: '1px solid var(--border)' }}>
          <div className="h-3 w-24 rounded" style={{ background: 'var(--overlay-medium)' }} />
          <div className="h-4 w-full rounded" style={{ background: 'var(--overlay-light)' }} />
          <div className="h-4 w-4/5 rounded" style={{ background: 'var(--overlay-light)' }} />
          <div className="h-4 w-3/5 rounded" style={{ background: 'var(--overlay-light)' }} />
        </div>
        {/* Card skeletons */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl p-4 space-y-2"
            style={{ background: 'var(--overlay-subtle)', border: '1px solid var(--border)' }}>
            <div className="flex gap-2">
              <div className="h-3 w-10 rounded" style={{ background: 'var(--overlay-medium)' }} />
              <div className="h-3 w-16 rounded" style={{ background: 'var(--overlay-medium)' }} />
            </div>
            <div className="h-3 w-full rounded" style={{ background: 'var(--overlay-light)' }} />
            <div className="h-4 w-full rounded" style={{ background: 'var(--overlay-light)' }} />
            <div className="h-4 w-2/3 rounded" style={{ background: 'var(--overlay-light)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
