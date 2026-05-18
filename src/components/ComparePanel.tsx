'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'

const FOCUS_AREAS = [
  { label: 'Low End', icon: '🔉', color: 'border-[var(--color-primary)]/40', question: 'Focus on low end: kick, bass, sub relationship, muddiness, and mono compatibility.' },
  { label: 'Mix Balance', icon: '⚖️', color: 'border-white/20', question: 'Focus on overall mix balance: level relationships, frequency clashes, masking, and element separation.' },
  { label: 'Arrangement', icon: '🎼', color: 'border-white/20', question: 'Focus on arrangement: density, space usage, tension/release, and structural development.' },
  { label: 'Tension & Energy', icon: '⚡', color: 'border-[var(--color-gold)]/30', question: 'Focus on tension and energy: build-ups, drops, dynamic contrast, and emotional arc.' },
  { label: 'Stereo Width', icon: '↔️', color: 'border-white/20', question: 'Focus on stereo width: imaging, mono compatibility, side content, and width per frequency band.' },
  { label: 'Vocals / Lead', icon: '🎤', color: 'border-[var(--color-error)]/30', question: 'Focus on vocals or lead instrument: presence, clarity, reverb tail, sibilance, and sit in the mix.' },
  { label: 'Master Check', icon: '🎚️', color: 'border-[var(--color-success)]/30', question: 'Master-level check: loudness, limiting, True Peak, LUFS target, and overall punch.' },
  { label: 'Next Steps', icon: '📈', color: 'border-[var(--color-primary)]/40', question: 'What are the 3 most impactful next steps to improve this mix?' },
]

export default function ComparePanel() {
  const { result, compareResult, compareLoading, compareError, setCompareResult, setCompareLoading, setCompareError } = useAnalysisStore()
  const [v2File, setV2File] = useState<File | null>(null)
  const [customQuestion, setCustomQuestion] = useState('')
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null)

  if (!result) return null

  async function handleCompare() {
    if (!v2File) return

    const focusQuestion = selectedFocus
      ? FOCUS_AREAS.find(f => f.label === selectedFocus)?.question ?? ''
      : customQuestion.trim()

    setCompareLoading(true)
    setCompareError(null)
    setCompareResult(null)

    const form = new FormData()
    form.append('v2', v2File)
    form.append('v1Summary', result.summary)
    form.append('v1Feedback', JSON.stringify(result.feedbackItems))
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

  const activeQuestion = selectedFocus
    ? FOCUS_AREAS.find(f => f.label === selectedFocus)?.question ?? ''
    : customQuestion

  return (
    <div className="space-y-5">
      {/* Upload V2 */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-widest">Compare V2</p>
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { setV2File(e.target.files?.[0] ?? null); setCompareResult(null) }}
          />
          <div className={`border border-dashed rounded-xl px-4 py-5 text-center transition-colors ${
            v2File ? 'border-white/20 bg-white/[0.02]' : 'border-white/10 hover:border-white/20'
          }`}>
            {v2File ? (
              <p className="text-sm text-white/70">{v2File.name}</p>
            ) : (
              <p className="text-sm text-white/30">Drop V2 audio file here or click to browse</p>
            )}
          </div>
        </label>
      </div>

      {/* Focus Area Selector */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-primary)] font-medium uppercase tracking-widest mb-1">Focus area (optional)</p>
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

      {/* Custom focus question */}
      {!selectedFocus && (
        <div className="space-y-1">
          <p className="text-xs text-white/40">Or ask a specific question (optional)</p>
          <textarea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Has the vocal presence improved? Is the low end tighter?"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
          />
        </div>
      )}

      {compareError && (
        <div className="bg-[var(--color-notification)]/10 border border-[var(--color-notification)]/30 rounded-xl px-4 py-3 text-sm text-[var(--color-notification)]">
          {compareError}
        </div>
      )}

      <button
        onClick={handleCompare}
        disabled={!v2File || compareLoading}
        className="w-full py-3 rounded-lg bg-white/8 hover:bg-white/12 disabled:opacity-40 transition-colors text-sm font-medium"
      >
        {compareLoading ? 'Comparing…' : 'Compare versions'}
      </button>
    </div>
  )
}
