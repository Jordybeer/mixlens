import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase'
import type { EnergyPoint, Section, FeedbackItem, AnalysisResult, FFTBand } from '@/types/analysis'
import { summariseFFT } from '@/lib/audioAnalysis'

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
  cropInfo: { originalDuration: number; cropStart: number; cropEnd: number } | null
  sections: Section[]
  sectionsAreManual: boolean
  energyCurve: EnergyPoint[]
  spectral: SpectralSummary | null
  fftBands: FFTBand[]
  customQuestion?: string
  whatChanged?: string | null
  projectId?: string | null
  fileName?: string | null
}

/** Extract the first top-level JSON object from a string.
 *  Handles Claude responses that wrap the JSON in prose or markdown fences. */
function extractJSON(text: string): string {
  // Strip markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()

  // Walk character by character to find the outermost { }
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) return text.slice(start, i + 1)
    }
  }
  // Fallback — return trimmed original and let JSON.parse throw a clear error
  return text.trim()
}

export async function POST(req: NextRequest) {
  try {
    // ─── Auth + user API key ────────────────────────────────────────────────
    const { supabase } = createRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single()

    const apiKey = (settings as { anthropic_api_key: string } | null)?.anthropic_api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'No Anthropic API key set. Add one in Settings.' }, { status: 400 })
    }

    const body: AnalysePayload = await req.json()
    const {
      bpm, key, durationSeconds, sections, sectionsAreManual,
      energyCurve, spectral, fftBands, customQuestion, whatChanged,
      projectId, fileName,
    } = body

    // ─── Build prompt ────────────────────────────────────────────────────────
    const sectionSummary = sections.length
      ? sections.map((s) => `${s.label} (${fmt(s.startSeconds)}-${fmt(s.endSeconds)})`).join(', ')
      : 'not provided'

    const sectionNote = sectionsAreManual
      ? '(user-defined - treat as accurate, reference these timestamps directly in feedback)'
      : '(auto-estimated from energy curve - treat as approximate, do not over-rely on exact timestamps)'

    const energySummary = energyCurve
      .filter((_, i) => i % 4 === 0)
      .map((p) => `${fmt(p.time)}:${(p.rms * 100).toFixed(1)}%`)
      .join(' | ')

    const rmsValues = energyCurve.map((p) => p.rms)
    const peakRms = rmsValues.length ? Math.max(...rmsValues) : 0
    const avgRms = rmsValues.length ? rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length : 0
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

    const changedFooter = whatChanged
      ? 'Since the producer described specific changes, include targeted items that directly address whether each change achieved its goal - good or bad.'
      : ''

    const prompt = [
      'You are a senior mixing engineer and music producer doing a detailed mix review.',
      '',
      'IMPORTANT: Respond with raw JSON only. No markdown, no prose before or after the JSON object.',
      'Base feedback strictly on the measured data. Be specific: reference exact timestamps, section names, frequency ranges, and dB values.',
      changesBlock,
      '## Track data',
      `- Duration: ${fmt(durationSeconds)} | BPM: ${bpm ?? 'unknown'} | Key: ${key ?? 'unknown'}`,
      `- Sections ${sectionNote}: ${sectionSummary}`,
      '',
      '## Energy / dynamics',
      `- RMS over time (every 4 s): ${energySummary}`,
      `- ${spectralMeta}`,
      '',
      '## Frequency spectrum (track average)',
      `- ${fftSummary}`,
      questionBlock,
      '',
      '## Response format — raw JSON object, nothing else',
      '{',
      '  "summary": "2-3 sentence overall assessment grounded in the data.",',
      '  "feedbackItems": [',
      '    {',
      '      "id": "unique-slug",',
      '      "timestamp": <seconds as number, or null if general>,',
      '      "severity": "CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION",',
      '      "observation": "what the measured data shows",',
      '      "feedback": "actionable fix"',
      '    }',
      '  ]',
      '}',
      '',
      'Aim for 8-12 items. At least 1 VALIDATION. CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish.',
      changedFooter,
    ].join('\n')

    // ─── Call Anthropic with retry on malformed JSON ─────────────────────────
    const client = new Anthropic({ apiKey })
    const MAX_ATTEMPTS = 3
    let lastError = ''
    let result: AnalysisResult | null = null
    let finalUsage = { input_tokens: 0, output_tokens: 0 }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let message
      try {
        message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        })
      } catch (apiErr: unknown) {
        const e = apiErr as { status?: number; message?: string }
        console.error(`[analyse] Anthropic error (attempt ${attempt}):`, e?.status, e?.message)
        if (e?.status === 401) return NextResponse.json({ error: 'Invalid Anthropic API key. Update it in Settings.' }, { status: 500 })
        if (e?.status === 429) return NextResponse.json({ error: 'Rate limit — wait and retry.' }, { status: 429 })
        return NextResponse.json({ error: `API error ${e?.status}: ${e?.message}` }, { status: 500 })
      }

      finalUsage = message.usage
      const raw = (message.content[0] as { type: string; text: string }).text

      let parsed: { summary: string; feedbackItems: Omit<FeedbackItem, 'status'>[] } | null = null
      try {
        parsed = JSON.parse(extractJSON(raw))
      } catch (parseErr) {
        lastError = `JSON parse failed on attempt ${attempt}: ${(parseErr as Error).message}`
        console.error(`[analyse] ${lastError}\nRaw response:`, raw.slice(0, 500))
        if (attempt < MAX_ATTEMPTS) continue  // retry
        break
      }

      // ─── Cost ───────────────────────────────────────────────────────────────
      const INPUT_RATE  = 3.00 / 1_000_000
      const OUTPUT_RATE = 15.00 / 1_000_000
      const inputTokens  = finalUsage.input_tokens
      const outputTokens = finalUsage.output_tokens
      const llmCostUsd   = inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE
      const infraCostUsd = 0.005
      const totalCostUsd = llmCostUsd + infraCostUsd

      result = {
        bpm, key, durationSeconds, sections,
        energyCurve,
        fftSpectrum: fftBands ?? [],
        summary: parsed!.summary,
        feedbackItems: parsed!.feedbackItems.map((item) => ({ ...item, status: 'pending' as const })),
        costEstimate: { inputTokens, outputTokens, llmCostUsd, infraCostUsd, totalCostUsd, model: 'claude-sonnet-4-5' },
      }
      break  // success
    }

    if (!result) {
      return NextResponse.json({ error: `Claude returned malformed JSON after ${MAX_ATTEMPTS} attempts. Please try again.` }, { status: 500 })
    }

    // ─── Persist to Supabase if project selected ─────────────────────────────
    if (projectId && fileName) {
      await supabase.from('analyses').insert({
        user_id: user.id,
        project_id: projectId,
        file_name: fileName,
        analysed_at: new Date().toISOString(),
        lean_result: {
          bpm: result.bpm,
          key: result.key,
          durationSeconds: result.durationSeconds,
          summary: result.summary,
          feedbackItems: result.feedbackItems,
          sections: result.sections,
          costEstimate: result.costEstimate,
        },
      })
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
