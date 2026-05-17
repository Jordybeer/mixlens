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
  spectral: SpectralSummary | null
  customQuestion?: string
}

interface SpectralSummary {
  avgCentroid: number
  avgRolloff: number
  avgFlux: number
  dynamicRange: number
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalysePayload = await req.json()
    const { bpm, key, durationSeconds, sections, energyCurve, spectral, customQuestion } = body

    const sectionSummary = sections
      .map((s) => `${s.label} (${fmt(s.startSeconds)}–${fmt(s.endSeconds)})`)
      .join(', ')

    const energySummary = energyCurve
      .filter((_, i) => i % 5 === 0)
      .map((p) => `${fmt(p.time)}: ${(p.rms * 100).toFixed(1)}%`)
      .join(' | ')

    const spectralSummary = spectral
      ? `Spectral centroid avg: ${spectral.avgCentroid.toFixed(0)} Hz, rolloff avg: ${spectral.avgRolloff.toFixed(0)} Hz, flux avg: ${spectral.avgFlux.toFixed(4)}, dynamic range: ${spectral.dynamicRange.toFixed(1)} dB`
      : 'Spectral data unavailable'

    const question = customQuestion?.trim()
      ? `\n\nProducer question: "${customQuestion}"`
      : ''

    const prompt = `You are an expert music producer and mixing engineer giving feedback to a fellow producer. Be specific, reference exact timestamps and section names. Avoid generic advice.

Track data:
- Duration: ${fmt(durationSeconds)}
- BPM: ${bpm ?? 'unknown'}
- Key: ${key ?? 'unknown'}
- Sections: ${sectionSummary}
- Energy (RMS over time): ${energySummary}
- ${spectralSummary}${question}

Respond with raw JSON only (no markdown fences):
{
  "summary": "2-3 sentence overall assessment",
  "feedbackItems": [
    {
      "id": "unique-string",
      "timestamp": <seconds as number, or null for general>,
      "severity": "VALIDATION" | "MINOR" | "IMPORTANT" | "CRITICAL",
      "observation": "what is detected at this point",
      "feedback": "specific, actionable advice"
    }
  ]
}

Aim for 8–12 items. Include at least 2 CRITICAL or IMPORTANT items if warranted.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const parsed = JSON.parse(raw) as {
      summary: string
      feedbackItems: Omit<FeedbackItem, 'status'>[]
    }

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

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
