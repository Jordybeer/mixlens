import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { EnergyPoint, Section, FeedbackItem, AnalysisResult, FFTBand } from '@/types/analysis'
import { summariseFFT } from '@/lib/audioAnalysis'

const client = new Anthropic()

interface AnalysePayload {
  bpm: number | null
  key: string | null
  durationSeconds: number
  sections: Section[]
  energyCurve: EnergyPoint[]
  spectral: SpectralSummary | null
  fftBands: FFTBand[]
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
    const { bpm, key, durationSeconds, sections, energyCurve, spectral, fftBands, customQuestion } = body

    const sectionSummary = sections
      .map((s) => `${s.label} (${fmt(s.startSeconds)}–${fmt(s.endSeconds)})`)
      .join(', ')

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

    const fftSummary = fftBands?.length
      ? summariseFFT(fftBands)
      : 'FFT data unavailable'

    const question = customQuestion?.trim()
      ? `\n\nProducer's specific question: "${customQuestion}"`
      : ''

    const prompt = `You are a senior mixing engineer and music producer giving a detailed mix review.
You have access to real measured audio data below — base your feedback strictly on this data. Do not invent problems not evidenced by the numbers. Be specific: reference exact timestamps, frequency ranges, section names, and dB values from the data.

## Track Data
- Duration: ${fmt(durationSeconds)}
- BPM: ${bpm ?? 'unknown'} | Key: ${key ?? 'unknown'}
- Sections detected: ${sectionSummary}

## Energy / Dynamics
- RMS over time (every 4s): ${energySummary}
- ${spectralMeta}

## Frequency Spectrum (averaged over full track)
- ${fftSummary}
${question}

## Instructions
Respond with raw JSON only (no markdown fences, no extra text):
{
  "summary": "2-3 sentence overall assessment grounded in the data",
  "feedbackItems": [
    {
      "id": "unique-slug",
      "timestamp": <seconds as number, or null if general>,
      "severity": "CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION",
      "observation": "what the data shows at this point (be specific with numbers)",
      "feedback": "actionable fix with specific EQ bands, compressor settings, or arrangement moves"
    }
  ]
}

Aim for 8–12 items. Severity guide: CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish, VALIDATION = something that works well. Include at least 1 VALIDATION item.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as {
      summary: string
      feedbackItems: Omit<FeedbackItem, 'status'>[]
    }

    const result: AnalysisResult = {
      bpm,
      key,
      durationSeconds,
      sections,
      energyCurve,
      fftSpectrum: fftBands ?? [],
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
