'use client'

import { useState } from 'react'
import type { AnalysisResult } from '@/types/analysis'
import { formatTime } from '@/lib/audioAnalysis'

export default function CopyButton({ result }: { result: AnalysisResult }) {
  const [copied, setCopied] = useState(false)

  function buildMarkdown() {
    const lines: string[] = []
    lines.push('# MixLens Feedback')
    lines.push('')
    const meta = [
      result.bpm ? `**BPM:** ${result.bpm}` : null,
      result.key ? `**Key:** ${result.key}` : null,
      `**Duration:** ${formatTime(result.durationSeconds)}`,
    ].filter(Boolean).join(' · ')
    lines.push(meta)
    lines.push('')
    lines.push('## Summary')
    lines.push(result.summary)
    lines.push('')
    lines.push('## Feedback Items')
    lines.push('')
    for (const item of result.feedbackItems) {
      if (item.status === 'ignored') continue
      const ts = item.timestamp !== null ? ` @ ${formatTime(item.timestamp)}` : ''
      const todo = item.status === 'todo' ? ' ☐' : ''
      lines.push(`### [${item.severity}]${ts}${todo}`)
      lines.push(`**Observation:** ${item.observation}`)
      lines.push('')
      lines.push(item.feedback)
      lines.push('')
    }
    return lines.join('\n')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildMarkdown())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs transition-colors flex items-center gap-1.5 hover:opacity-80"
      style={{ color: 'var(--text-muted)' }}
    >
      {copied ? '✓ Copied' : '⎘ Copy as markdown'}
    </button>
  )
}
