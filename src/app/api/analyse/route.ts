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

    const prompt = `You are a senior mixing engineer and music producer doing a detailed mix review.\n\nBase feedback strictly on the measured data \u2014 do not invent issues not evidenced by numbers. Be specific: reference exact timestamps, section names, frequency ranges, and dB values from the data.\n${changesBlock}\n## Track data\n- Duration: ${fmt(durationSeconds)} | BPM: ${bpm ?? 'unknown'} | Key: ${key ?? 'unknown'}\n- Sections ${sectionNote}: ${sectionSummary}\n\n## Energy / dynamics\n- RMS over time (every 4 s): ${energySummary}\n- ${spectralMeta}\n\n## Frequency spectrum (track average)\n- ${fftSummary}\n${questionBlock}\n\n## Response format\nRaw JSON only \u2014 no markdown fences, no extra text:\n{\n  "summary": "2\u20133 sentence overall assessment grounded in the data. If the producer described changes, open with a direct verdict on whether those changes moved things in the right direction.",\n  "feedbackItems": [\n    {\n      "id": "unique-slug",\n      "timestamp": <seconds as number, or null if general>,\n      "severity": "CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION",\n      "observation": "what the measured data shows \u2014 specific numbers",\n      "feedback": "actionable fix \u2014 EQ bands, compressor settings, or arrangement move"\n    }\n  ]\n}\n\nAim for 8\u201312 items. At least 1 VALIDATION (something working well). Severity guide: CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish.\n${\n  whatChanged\n    ? 'Since the producer described specific changes, include targeted items that directly address whether each change achieved its goal \u2014 good or bad.'\n    : ''\n}`

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
      if (e?.status === 429) return NextResponse.json({ error: 'Rate limit \u2014 wait and retry.' }, { status: 429 })
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

    // Cost calculation — claude-sonnet-4-5: $3/M input, $15/M output
    const INPUT_RATE  = 3.00 / 1_000_000
    const OUTPUT_RATE = 15.00 / 1_000_000
    const inputTokens  = message.usage.input_tokens
    const outputTokens = message.usage.output_tokens
    const llmCostUsd   = inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE
    const infraCostUsd = 0.005 // fixed buffer: upload + audio processing
    const totalCostUsd = llmCostUsd + infraCostUsd

    const result: AnalysisResult = {
      bpm, key, durationSeconds, sections,
      energyCurve,
      fftSpectrum: fftBands ?? [],
      summary: parsed.summary,
      feedbackItems: parsed.feedbackItems.map((item) => ({ ...item, status: 'pending' as const })),
      costEstimate: {
        inputTokens,
        outputTokens,
        llmCostUsd,
        infraCostUsd,
        totalCostUsd,
        model: 'claude-sonnet-4-5',
      },
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
