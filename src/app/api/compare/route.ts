import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { EnergyPoint, Section, FFTBand, CompareResult } from '@/types/analysis'
import { summariseFFT } from '@/lib/audioAnalysis'

const client = new Anthropic()

interface TrackSnapshot {
  label: string          // 'v1' or 'v2'
  fileName: string
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  spectral: { avgCentroid: number; avgRolloff: number; avgFlux: number; dynamicRange: number } | null
  fftBands: FFTBand[]
}

interface ComparePayload {
  v1: TrackSnapshot
  v2: TrackSnapshot
  customQuestion?: string
}

function buildSnapshot(snap: TrackSnapshot): string {
  const sectionSummary = snap.sections
    .map((s) => `${s.label} (${fmt(s.startSeconds)}–${fmt(s.endSeconds)})`)
    .join(', ')

  const rmsValues = snap.energyCurve.map((p) => p.rms)
  const peakRms = Math.max(...rmsValues)
  const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length
  const crestFactor = peakRms > 0 ? (20 * Math.log10(peakRms / avgRms)).toFixed(1) : 'n/a'

  const dynamicRange = snap.spectral ? `${snap.spectral.dynamicRange.toFixed(1)} dB` : 'n/a'
  const fftSummary = snap.fftBands?.length ? summariseFFT(snap.fftBands) : 'FFT unavailable'

  return [
    `### ${snap.label.toUpperCase()} — ${snap.fileName}`,
    `- Duration: ${fmt(snap.durationSeconds)} | BPM: ${snap.bpm ?? 'unknown'} | Key: ${snap.key ?? 'unknown'}`,
    `- Sections: ${sectionSummary}`,
    `- Dynamic range: ${dynamicRange} | Crest factor: ${crestFactor} dB`,
    `- ${fftSummary}`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const body: ComparePayload = await req.json()
    const { v1, v2, customQuestion } = body

    const question = customQuestion?.trim()
      ? `\n\nProducer's specific question: "${customQuestion}"`
      : ''

    const prompt = `You are a senior mixing engineer reviewing two versions of the same track to identify what improved, what got worse, and what still needs work.

Base your analysis strictly on the measured data provided. Reference specific dB values, frequency ranges, and timestamps. Do not invent changes that aren't evidenced by the numbers.

${buildSnapshot(v1)}

${buildSnapshot(v2)}
${question}

Respond with raw JSON only (no markdown fences):
{
  "summary": "2-3 sentence overall comparison grounded in the data",
  "overallVerdict": "better" | "worse" | "mixed" | "neutral",
  "items": [
    {
      "id": "unique-slug",
      "tag": "improved" | "regression" | "new_issue" | "resolved" | "unchanged",
      "area": "short area name e.g. Low-mids / Dynamic range / Drop energy",
      "v1": "what the data showed in v1",
      "v2": "what the data shows in v2",
      "verdict": "one actionable sentence — what to do next or confirmation it's fixed"
    }
  ]
}

Aim for 6–10 items covering frequency balance, dynamics, arrangement energy, and any spectral warnings. Tag accurately — only mark 'improved' if the numbers clearly support it.`

    let message
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (apiErr: unknown) {
      const e = apiErr as { status?: number; message?: string }
      console.error('[compare] Anthropic API error:', e?.status, e?.message)
      if (e?.status === 401) return NextResponse.json({ error: 'Invalid API key.' }, { status: 500 })
      if (e?.status === 429) return NextResponse.json({ error: 'Rate limit — wait and retry.' }, { status: 429 })
      return NextResponse.json({ error: `Anthropic error ${e?.status}: ${e?.message}` }, { status: 500 })
    }

    const raw = (message.content[0] as { type: string; text: string }).text
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    let parsed: CompareResult
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[compare] JSON parse failed. Raw:', raw)
      return NextResponse.json({ error: 'Claude returned malformed JSON. Try again.' }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[compare] unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 }
    )
  }
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
