'use client'

import { useState } from 'react'
import { useAnalysisStore } from '@/store/useAnalysisStore'

const TOOLS: { label: string; icon: string; question: string; color: string }[] = [
  {
    label: 'Low End',
    icon: '🔉',
    color: 'border-[#4f98a3]/40 hover:border-[#4f98a3]/80 hover:bg-[#4f98a3]/8',
    question: 'Focus on the low end: is the sub and kick relationship clean? Is there mud between 100–250 Hz? Does the bass translate on small speakers? Are there any low-end masking issues between bass and kick?',
  },
  {
    label: 'Mix Balance',
    icon: '⚖️',
    color: 'border-white/15 hover:border-white/40 hover:bg-white/5',
    question: 'Analyse the overall mix balance. Is anything too loud or too quiet? Are the mids cluttered? Does anything stick out unnaturally? Check for frequency masking between elements and identify which frequencies need space.',
  },
  {
    label: 'Arrangement',
    icon: '🎬',
    color: 'border-white/15 hover:border-white/40 hover:bg-white/5',
    question: 'Review the arrangement structure. Are the transitions between sections smooth? Is there enough variation to maintain listener interest? Do the intro and outro work? Are drops and builds effective? Where does energy feel stagnant?',
  },
  {
    label: 'Tension & Energy',
    icon: '⚡',
    color: 'border-[#e8af34]/30 hover:border-[#e8af34]/60 hover:bg-[#e8af34]/5',
    question: 'Evaluate tension and energy flow throughout the track. Does the energy build effectively before drops? Are there moments that feel flat or that release tension too early? Identify where the track loses momentum and what could push it forward.',
  },
  {
    label: 'Stereo Width',
    icon: '⇔',
    color: 'border-white/15 hover:border-white/40 hover:bg-white/5',
    question: 'Assess the stereo field. Does the mix feel wide enough without losing mono compatibility? Are there elements that are too wide and disappear in mono? Is the low end properly centered? Are there phasing issues?',
  },
  {
    label: 'Vocals / Lead',
    icon: '🎤',
    color: 'border-[#d163a7]/30 hover:border-[#d163a7]/60 hover:bg-[#d163a7]/5',
    question: 'Focus on the lead element or vocals. Does it sit well in the mix or get buried? Is it too forward? Is there harshness in the 2–5 kHz range? Does the reverb/delay tail interfere with clarity? Does it cut through on small speakers?',
  },
  {
    label: 'Master Check',
    icon: '🎚️',
    color: 'border-[#6daa45]/30 hover:border-[#6daa45]/60 hover:bg-[#6daa45]/5',
    question: 'Evaluate this track for mastering readiness. Is the loudness appropriate with enough headroom (target −6 dBFS peak for a mix bus)? Is dynamic range preserved? Are there any clipping or distortion artefacts? Is it competitive in loudness with commercial references?',
  },
  {
    label: 'Next Steps',
    icon: '📈',
    color: 'border-[#4f98a3]/40 hover:border-[#4f98a3]/80 hover:bg-[#4f98a3]/8',
    question: 'Based on everything you can detect, what are the 3–5 most impactful next steps I should take to improve this track? Rank them by priority. Be specific and actionable — reference timestamps and frequency ranges where possible.',
  },
]

export default function ToolsPanel() {
  const { customQuestion, setCustomQuestion } = useAnalysisStore()
  const [active, setActive] = useState<string | null>(null)

  function selectTool(tool: typeof TOOLS[0]) {
    if (active === tool.label) {
      // deselect — clear if this tool set it
      setCustomQuestion('')
      setActive(null)
    } else {
      setCustomQuestion(tool.question)
      setActive(tool.label)
    }
  }

  // If user manually edited the question, deactivate tool highlight
  function handleManualEdit(val: string) {
    setCustomQuestion(val)
    if (active && val !== TOOLS.find((t) => t.label === active)?.question) {
      setActive(null)
    }
  }

  return { active, selectTool, handleManualEdit }
}

export function ToolsGrid() {
  const { customQuestion, setCustomQuestion } = useAnalysisStore()
  const [active, setActive] = useState<string | null>(null)

  function selectTool(tool: typeof TOOLS[0]) {
    if (active === tool.label) {
      setCustomQuestion('')
      setActive(null)
    } else {
      setCustomQuestion(tool.question)
      setActive(tool.label)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/40 uppercase tracking-widest">Focus tools</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            onClick={() => selectTool(tool)}
            className={`text-left border rounded-xl px-3 py-2.5 transition-all ${
              active === tool.label
                ? 'bg-white/10 border-white/30'
                : tool.color
            }`}
          >
            <span className="text-base leading-none">{tool.icon}</span>
            <p className="text-xs font-medium text-white/80 mt-1.5 leading-tight">{tool.label}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
