'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'

interface Props {
  onOpenKeyModal: () => void
}

export default function ToolsPanel({ onOpenKeyModal }: Props) {
  const { result } = useAnalysisStore()
  const [copied, setCopied] = useState(false)

  if (!result) return null

  type Tool = { id: string; label: string; description: string; color: string; action: () => void }

  const tools: Tool[] = [
    {
      id: 'export-feedback',
      label: 'Export feedback',
      description: 'Download all feedback items as a JSON file',
      color: 'border-[var(--color-primary)]/40 hover:border-[var(--color-primary)]/80 hover:bg-[var(--color-primary)]/8',
      action: () => {
        const data = JSON.stringify(result.feedbackItems, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'mixlens-feedback.json'
        a.click()
        URL.revokeObjectURL(url)
      },
    },
    {
      id: 'export-summary',
      label: 'Copy summary',
      description: 'Copy the analysis summary to clipboard',
      color: 'border-white/15 hover:border-white/30 hover:bg-white/5',
      action: async () => {
        await navigator.clipboard.writeText(result.summary)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
    },
    {
      id: 'export-markdown',
      label: 'Export markdown',
      description: 'Download full analysis as a .md file',
      color: 'border-[var(--color-gold)]/30 hover:border-[var(--color-gold)]/60 hover:bg-[var(--color-gold)]/5',
      action: () => {
        const lines: string[] = []
        lines.push('# MixLens Analysis')
        lines.push('')
        lines.push('## Summary')
        lines.push(result.summary)
        lines.push('')
        lines.push('## Feedback')
        result.feedbackItems.forEach((item) => {
          lines.push(`### [${item.severity}] ${item.category ?? ''}`)
          lines.push(`**Observation:** ${item.observation}`)
          lines.push(`**Feedback:** ${item.feedback}`)
          if (item.tags?.length) lines.push(`*Tags: ${item.tags.join(', ')}*`)
          lines.push('')
        })
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'mixlens-analysis.md'
        a.click()
        URL.revokeObjectURL(url)
      },
    },
    {
      id: 'export-todo',
      label: 'Export todo list',
      description: 'Download todo items as plain text',
      color: 'border-[var(--color-error)]/30 hover:border-[var(--color-error)]/60 hover:bg-[var(--color-error)]/5',
      action: () => {
        const todos = result.feedbackItems.filter((i) => i.status === 'todo')
        if (!todos.length) { alert('No todo items yet.'); return }
        const lines = todos.map((t, i) => `${i + 1}. [${t.severity}] ${t.feedback}`)
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'mixlens-todos.txt'
        a.click()
        URL.revokeObjectURL(url)
      },
    },
    {
      id: 'update-key',
      label: 'Update API key',
      description: 'Change your stored Anthropic API key',
      color: 'border-[var(--color-primary)]/40 hover:border-[var(--color-primary)]/80 hover:bg-[var(--color-primary)]/8',
      action: () => onOpenKeyModal(),
    },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40 uppercase tracking-widest">Tools</p>
      <div className="grid grid-cols-1 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={tool.action}
            className={`text-left px-4 py-3 rounded-xl border transition-colors ${tool.color}`}
          >
            <p className="text-sm font-medium text-white/80">
              {tool.id === 'export-summary' && copied ? 'Copied!' : tool.label}
            </p>
            <p className="text-xs text-white/35 mt-0.5">{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
