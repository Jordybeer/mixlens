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

  type Tool = { id: string; label: string; description: string; action: () => void }

  const tools: Tool[] = [
    {
      id: 'export-feedback',
      label: 'Feedback exporteren',
      description: 'Download alle feedback-items als JSON-bestand',
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
      label: 'Samenvatting kopiëren',
      description: 'Kopieer de analysesamenvatting naar klembord',
      action: async () => {
        await navigator.clipboard.writeText(result.summary)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
    },
    {
      id: 'export-markdown',
      label: 'Exporteren als markdown',
      description: 'Download volledige analyse als .md-bestand',
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
      label: 'Todo-lijst exporteren',
      description: 'Download todo-items als platte tekst',
      action: () => {
        const todos = result.feedbackItems.filter((i) => i.status === 'todo')
        if (!todos.length) { alert('Nog geen todo-items.'); return }
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
      label: 'API-sleutel bijwerken',
      description: 'Verander je opgeslagen Anthropic API-sleutel',
      action: () => onOpenKeyModal(),
    },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Tools</p>
      <div className="grid grid-cols-1 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={tool.action}
            className="text-left px-4 py-3 rounded-xl border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {tool.id === 'export-summary' && copied ? 'Gekopieerd!' : tool.label}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
