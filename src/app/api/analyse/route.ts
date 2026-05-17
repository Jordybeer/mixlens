import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { EnergyPoint, Section, FeedbackItem, AnalysisResult } from '@/types/analysis'

const client = new Anthropic()

interface AnalysePayload {
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  customQuestion?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalysePayload = await req.json()
    const { bpm, key, durationSeconds, sections, energyCurve, customQuestion } = body

    const sectionSummary = sections
      .map((s) => `${s.label} (${formatTime(s.startSeconds)}–${formatTime(s.endSeconds)})`)
      .join(', ')

    const energySummary = energyCurve
      .filter((_, i) => i % 5 === 0)
      .map((p) => `${formatTime(p.time)}: ${(p.rms * 100).toFixed(1)}%`)
      .join(' | ')

    const question = customQuestion?.trim()
      ? `\n\nThe producer has a specific question: "${customQuestion}"`
      : ''

    const prompt = `You are an expert music producer and mixing engineer. Analyse this track based on extracted audio data and give actionable, specific feedback.

Track data:
- Duration: ${formatTime(durationSeconds)}
- BPM: ${bpm ?? 'unknown'}
- Key: ${key ?? 'unknown'}
- Detected sections: ${sectionSummary}
- Energy curve (RMS over time): ${energySummary}${question}

Respond with a JSON object (no markdown, raw JSON only) with this exact shape:
{
  "summary": "2-3 sentence overall assessment",
  "feedbackItems": [
    {
      "id": "unique string",
      "timestamp": <seconds as number or null for general>,
      "severity": "VALIDATION" | "MINOR" | "IMPORTANT" | "CRITICAL",
      "observation": "what you hear/detect at this point",
      "feedback": "specific, actionable advice"
    }
  ]
}

Provide 6–12 feedback items. Be specific, reference exact timestamps, BPM, section names. Avoid generic advice.`

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const parsed = JSON.parse(raw) as { summary: string; feedbackItems: Omit<FeedbackItem, 'status'>[] }

    const result: AnalysisResult = {
      bpm,
      key,
      durationSeconds,
      sections,
      energyCurve,
      summary: parsed.summary,
      feedbackItems: parsed.feedbackItems.map((item) => ({ ...item, status: 'pending' as const })),
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[analyse]', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
