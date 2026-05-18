'use client'

import { useState, useEffect } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useProjectAnalyses, type ProjectAnalysis } from '@/hooks/useProjectAnalyses'
import { formatTime } from '@/lib/audioAnalysis'

const FOCUS_AREAS = [
  { label: 'Low End',          icon: '🔉', color: 'border-[var(--color-primary)]/40',  question: 'Focus on low end: kick, bass, sub relationship, muddiness, and mono compatibility.' },
  { label: 'Mix Balance',      icon: '⚖️', color: 'border-white/20',                   question: 'Focus on overall mix balance: level relationships, frequency clashes, masking, and element separation.' },
  { label: 'Arrangement',      icon: '🎼', color: 'border-white/20',                   question: 'Focus on arrangement: density, space usage, tension/release, and structural development.' },
  { label: 'Tension & Energy', icon: '⚡', color: 'border-[var(--color-gold)]/30',     question: 'Focus on tension and energy: build-ups, drops, dynamic contrast, and emotional arc.' },
  { label: 'Stereo Width',     icon: '↔️', color: 'border-white/20',                   question: 'Focus on stereo width: imaging, mono compatibility, side content, and width per frequency band.' },
  { label: 'Vocals / Lead',    icon: '🎤', color: 'border-[var(--color-error)]/30',    question: 'Focus on vocals or lead instrument: presence, clarity, reverb tail, sibilance, and sit in the mix.' },
  { label: 'Master Check',     icon: '🎚️', color: 'border-[var(--color-success)]/30', question: 'Master-level check: loudness, limiting, True Peak, LUFS target, and overall punch.' },
  { label: 'Next Steps',       icon: '📈', color: 'border-[var(--color-primary)]/40',  question: 'What are the 3 most impactful next steps to improve this mix?' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ComparePanel() {
  const { result, compareResult, compareLoading, compareError, setCompareResult, setCompareLoading, setCompareError } = useAnalysisStore()
  const { activeProjectId } = useProjectStore()

  // "new" slot — user-uploaded file
  const [v2File, setV2File] = useState<File | null>(null)

  // "old" slot — auto-populated from latest project analysis, switchable via dropdown
  const [oldAnalysis, setOldAnalysis] = useState<ProjectAnalysis | null>(null)
  const [showOldPicker, setShowOldPicker] = useState(false)

  const [customQuestion, setCustomQuestion] = useState('')
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null)

  const { analyses, loading: analysesLoading } = useProjectAnalyses(activeProjectId)

  // Auto-populate "old" slot with latest project analysis on mount / when analyses load
  useEffect(() => {
    if (analyses.length > 0 && !oldAnalysis) {
      setOldAnalysis(analyses[0])
    }
  }, [analyses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close picker on outside click
  useEffect(() => {
    if (!showOldPicker) return
    function handleClick() { setShowOldPicker(false) }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [showOldPicker])

  const oldSummary  = oldAnalysis?.lean_result.summary       ?? result?.summary       ?? ''
  const oldFeedback = oldAnalysis?.lean_result.feedbackItems ?? result?.feedbackItems ?? []
  const oldLabel    = oldAnalysis?.file_name ?? (result ? 'Current analysis' : null)
  const hasOld      = !!oldAnalysis || !!result

  async function handleCompare() {
    if (!v2File || !hasOld) return

    const focusQuestion = selectedFocus
      ? FOCUS_AREAS.find(f => f.label === selectedFocus)?.question ?? ''
      : customQuestion.trim()

    setCompareLoading(true)
    setCompareError(null)
    setCompareResult(null)

    const form = new FormData()
    form.append('v2', v2File)
    form.append('v1Summary', oldSummary)
    form.append('v1Feedback', JSON.stringify(oldFeedback))
    if (focusQuestion) form.append('focusQuestion', focusQuestion)

    try {
      const res = await fetch('/api/compare', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Compare failed')
      setCompareResult(json)
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCompareLoading(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── OLD slot ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
          Reference (old)
        </p>

        <div
          className="relative rounded-xl px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="min-w-0 flex-1">
            {analysesLoading && !oldAnalysis ? (
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Loading project analyses…</p>
            ) : oldLabel ? (
              <>
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{oldLabel}</p>
                {oldAnalysis && (
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {fmtDate(oldAnalysis.analysed_at)}
                    {oldAnalysis.lean_result.bpm ? ` · ${Math.round(oldAnalysis.lean_result.bpm)} BPM` : ''}
                    {oldAnalysis.lean_result.key  ? ` · ${oldAnalysis.lean_result.key}` : ''}
                    {oldAnalysis.lean_result.durationSeconds > 0
                      ? ` · ${formatTime(oldAnalysis.lean_result.durationSeconds)}`
                      : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                No project analyses yet — analyse a track first.
              </p>
            )}
          </div>

          {/* Switch dropdown trigger */}
          {analyses.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowOldPicker((v) => !v) }}
                className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                style={{
                  border: '1px solid var(--border)',
                  background: showOldPicker ? 'var(--bg-panel)' : 'transparent',
                  color: 'var(--text-muted)',
                }}
              >
                Switch ⌄
              </button>

              {showOldPicker && (
                <div
                  className="absolute right-0 top-8 z-50 rounded-xl overflow-hidden shadow-xl"
                  style={{
                    width: '280px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                      Pick reference analysis
                    </p>
                  </div>
                  <ul className="max-h-60 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                    {analyses.map((a) => (
                      <li key={a.id}>
                        <button
                          className="w-full text-left px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                          onClick={() => { setOldAnalysis(a); setShowOldPicker(false) }}
                        >
                          <p
                            className="text-sm truncate font-medium"
                            style={{ color: a.id === oldAnalysis?.id ? 'var(--accent)' : 'var(--text)' }}
                          >
                            {a.file_name}
                          </p>
                          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {fmtDate(a.analysed_at)}
                            {a.lean_result.bpm ? ` · ${Math.round(a.lean_result.bpm)} BPM` : ''}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── NEW slot ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
          New version
        </p>
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { setV2File(e.target.files?.[0] ?? null); setCompareResult(null) }}
          />
          <div
            className="rounded-xl px-4 py-5 text-center transition-colors"
            style={{
              border: '1px dashed var(--border)',
              background: v2File ? 'var(--bg-surface)' : 'transparent',
            }}
          >
            {v2File ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{v2File.name}</p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
                Drop new audio version here or click to browse
              </p>
            )}
          </div>
        </label>
      </div>

      {/* ── Focus area selector ──────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>
          Focus area <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {FOCUS_AREAS.map((area) => (
            <button
              key={area.label}
              onClick={() => setSelectedFocus(selectedFocus === area.label ? null : area.label)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                selectedFocus === area.label
                  ? `${area.color} bg-white/8 text-white`
                  : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
              }`}
            >
              <span>{area.icon}</span> {area.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom question */}
      {!selectedFocus && (
        <div className="space-y-1">
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Or ask a specific question (optional)</p>
          <textarea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Has the vocal presence improved? Is the low end tighter?"
            rows={2}
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
        </div>
      )}

      {compareError && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--sev-critical) 30%, transparent)',
            color: 'var(--sev-critical)',
          }}
        >
          {compareError}
        </div>
      )}

      <button
        onClick={handleCompare}
        disabled={!v2File || !hasOld || compareLoading}
        className="w-full py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        {compareLoading ? 'Comparing…' : 'Compare versions'}
      </button>
    </div>
  )
}
