import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { EnergyPoint, Section, FeedbackItem, AnalysisResult, FFTBand } from '@/types/analysis'
import { summariseFFT } from '@/lib/audioAnalysis'

const client = new Anthropic()

interface SpectralSummary {
  avgCentroid: number
  avgRolloff: number
  avgFlux: number
  dynamicRange: number
}

interface AnalysePayload {
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  sectionsAreManual: boolean
  energyCurve: EnergyPoint[]
  spectral: SpectralSummary | null
  fftBands: FFTBand[]
  customQuestion?: string
  whatChanged?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalysePayload = await req.json()
    const {
      bpm, key, durationSeconds, sections, sectionsAreManual,
      energyCurve, spectral, fftBands, customQuestion, whatChanged,
    } = body

    const sectionSummary = sections.length
      ? sections.map((s) => `${s.label} (${fmt(s.startSeconds)}–${fmt(s.endSeconds)})`).join(', ')
      : 'not provided'

    const sectionNote = sectionsAreManual
      ? '(user-defined — treat as accurate, reference these timestamps directly in feedback)'
      : '(auto-estimated from energy curve — treat as approximate, do not over-rely on exact timestamps)'

    const energySummary = energyCurve
      .filter((_, i) => i % 4 === 0)
      .map((p) => `${fmt(p.time)}:${(p.rms * 100).toFixed(1)}%`)
      .join(' | ')

    const rmsValues = energyCurve.map((p) => p.rms)
    const peakRms = Math.max(...rmsValues)
    const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length
    const crestFactor = peakRms > 0 ? (20 * Math.log10(peakRms / avgRms)).toFixed(1) : 'n/a'

    const spectralMeta = spectral
      ? `Dynamic range: ${spectral.dynamicRange.toFixed(1)} dB | Crest factor: ${crestFactor} dB | Spectral flux: ${spectral.avgFlux.toFixed(4)}`
      : `Crest factor: ${crestFactor} dB`

    const fftSummary = fftBands?.length ? summariseFFT(fftBands) : 'FFT data unavailable'

    const changesBlock = whatChanged
      ? `\n## What the producer changed\n${whatChanged}\nEvaluate whether these changes are sonically sound given the measured data. Validate correct choices, flag any potential issues introduced.`
      : ''

    const questionBlock = customQuestion?.trim()
      ? `\n## Specific question\n"${customQuestion}"`
      : ''

    const prompt = `You are a senior mixing engineer and music producer doing a detailed mix review.

Base feedback strictly on the measured data — do not invent issues not evidenced by numbers. Be specific: reference exact timestamps, section names, frequency ranges, and dB values from the data.
${changesBlock}
## Track data
- Duration: ${fmt(durationSeconds)} | BPM: ${bpm ?? 'unknown'} | Key: ${key ?? 'unknown'}
- Sections ${sectionNote}: ${sectionSummary}

## Energy / dynamics
- RMS over time (every 4 s): ${energySummary}
- ${spectralMeta}

## Frequency spectrum (track average)
- ${fftSummary}
${questionBlock}

## Response format
Raw JSON only — no markdown fences, no extra text:
{
  "summary": "2–3 sentence overall assessment grounded in the data. If the producer described changes, open with a direct verdict on whether those changes moved things in the right direction.",
  "feedbackItems": [
    {
      "id": "unique-slug",
      "timestamp": <seconds as number, or null if general>,
      "severity": "CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION",
      "observation": "what the measured data shows — specific numbers",
      "feedback": "actionable fix — EQ bands, compressor settings, or arrangement move"
    }
  ]
}

Aim for 8–12 items. At least 1 VALIDATION (something working well). Severity guide: CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish.
${
  whatChanged
    ? 'Since the producer described specific changes, include targeted items that directly address whether each change achieved its goal — good or bad.'
    : ''
}`

    let message
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })
    } catch (apiErr: unknown) {
      const e = apiErr as { status?: number; message?: string }
      console.error('[analyse] Anthropic error:', e?.status, e?.message)
      if (e?.status === 401) return NextResponse.json({ error: 'Invalid API key.' }, { status: 500 })
      if (e?.status === 429) return NextResponse.json({ error: 'Rate limit — wait and retry.' }, { status: 429 })
      return NextResponse.json({ error: `API error ${e?.status}: ${e?.message}` }, { status: 500 })
    }

    const raw = (message.content[0] as { type: string; text: string }).text
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: { summary: string; feedbackItems: Omit<FeedbackItem, 'status'>[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[analyse] JSON parse failed:', raw)
      return NextResponse.json({ error: 'Claude returned malformed JSON. Try again.' }, { status: 500 })
    }

    const result: AnalysisResult = {
      bpm, key, durationSeconds, sections,
      energyCurve,
      fftSpectrum: fftBands ?? [],
      summary: parsed.summary,
      feedbackItems: parsed.feedbackItems.map((item) => ({ ...item, status: 'pending' as const })),
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[analyse] unexpected:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed.' },
      { status: 500 }
    )
  }
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
