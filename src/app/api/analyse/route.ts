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
  peakDbfs: number | null
  rmsDbfs: number | null
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
  audioStoragePath?: string | null
  lufs?: number | null
}

const DEEP_SCAN_SENTINEL = '__DEEP_SCAN__'

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
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
  return text.trim()
}

function buildTrackData(
  bpm: number | null,
  key: string | null,
  durationSeconds: number,
  sections: Section[],
  sectionsAreManual: boolean,
  energyCurve: EnergyPoint[],
  spectral: SpectralSummary | null,
  fftBands: FFTBand[],
  lufs: number | null,
) {
  const sectionSummary = sections.length
    ? sections.map((s) => `${s.label} (${fmt(s.startSeconds)}-${fmt(s.endSeconds)})`).join(', ')
    : 'not provided'
  const sectionNote = sectionsAreManual
    ? '(user-defined — treat as accurate)'
    : '(auto-estimated — treat as approximate)'
  const energySummary = energyCurve
    .filter((_, i) => i % 4 === 0)
    .map((p) => `${fmt(p.time)}:${(p.rms * 100).toFixed(1)}%`)
    .join(' | ')

  const rmsValues = energyCurve.map((p) => p.rms)
  const peakRms = rmsValues.length ? Math.max(...rmsValues) : 0
  const avgRms = rmsValues.length ? rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length : 0
  const crestFactor = peakRms > 0 && avgRms > 0
    ? (20 * Math.log10(peakRms / avgRms)).toFixed(1)
    : 'n/a'

  let loudnessLine: string
  if (
    spectral &&
    spectral.peakDbfs != null && isFinite(spectral.peakDbfs) &&
    spectral.rmsDbfs != null && isFinite(spectral.rmsDbfs)
  ) {
    const headroom = spectral.peakDbfs
    const loudnessNote = headroom > -1
      ? ' WARNING: peak at or near 0 dBFS — possible clipping'
      : headroom > -3
      ? ' (very hot — limited headroom)'
      : headroom > -6
      ? ' (approaching target ceiling)'
      : ' (good headroom)'
    loudnessLine = [
      `Peak: ${spectral.peakDbfs.toFixed(1)} dBFS${loudnessNote}`,
      `Integrated RMS: ${spectral.rmsDbfs.toFixed(1)} dBFS`,
      `True crest factor (peak minus RMS): ${spectral.dynamicRange.toFixed(1)} dB`,
      lufs != null ? `Estimated integrated loudness: ${lufs} LUFS` : null,
      spectral.avgFlux > 0 ? `Spectral flux (transient density): ${spectral.avgFlux.toFixed(4)}` : null,
    ].filter(Boolean).join(' | ')
  } else {
    loudnessLine = [
      lufs != null ? `Estimated integrated loudness: ${lufs} LUFS` : 'Loudness data unavailable',
      `Energy crest factor: ${crestFactor} dB`,
    ].filter(Boolean).join(' | ')
  }

  const fftSummary = fftBands?.length ? summariseFFT(fftBands) : 'FFT data unavailable'

  return [
    '## Track data',
    `- Duration: ${fmt(durationSeconds)} | BPM: ${bpm ?? 'unknown'} | Key: ${key ?? 'unknown'}`,
    `- Sections ${sectionNote}: ${sectionSummary}`,
    '',
    '## Energy / dynamics',
    `- RMS over time (every 4 s): ${energySummary}`,
    `- ${loudnessLine}`,
    '',
    '## Frequency spectrum (track average)',
    `- ${fftSummary}`,
  ].join('\n')
}

const SEVERITY_DESC = 'Valid severity values: "CRITICAL", "IMPORTANT", "MINOR", "VALIDATION"'
const CATEGORY_DESC = 'Valid category values: "Low End", "Mix Balance", "Arrangement", "Tension & Energy", "Stereo Width", "Vocals / Lead", "Master Check", "Next Steps"'

const ITEM_SCHEMA = `    {
      "id": "unique-kebab-slug",
      "timestamp": <number in seconds, or null if general>,
      "severity": <one of: "CRITICAL", "IMPORTANT", "MINOR", "VALIDATION">,
      "category": <one of: "Low End", "Mix Balance", "Arrangement", "Tension & Energy", "Stereo Width", "Vocals / Lead", "Master Check", "Next Steps">,
      "tags": ["short-tag-1", "short-tag-2"],
      "observation": "what the measured data shows",
      "feedback": "actionable fix"
    }`

function buildStandardPrompt(
  trackData: string,
  customQuestion: string | undefined,
  whatChanged: string | null | undefined,
) {
  const changesBlock = whatChanged
    ? `\n## What the producer changed\n${whatChanged}\nEvaluate whether these changes are sonically sound. Validate correct choices, flag any issues introduced.`
    : ''
  const questionBlock = customQuestion?.trim()
    ? `\n## Specific question\n"${customQuestion}"`
    : ''
  const changedFooter = whatChanged
    ? 'Since the producer described specific changes, include targeted items addressing whether each change achieved its goal.'
    : ''
  return [
    'You are a senior mixing engineer and music producer doing a detailed mix review.',
    '',
    'YOUR ENTIRE RESPONSE MUST BE A SINGLE RAW JSON OBJECT. No prose, no markdown, no code fences.',
    'Start your response with { and end with }. Nothing before or after.',
    'Base feedback strictly on the measured data. Be specific: reference exact timestamps, section names, frequency ranges, and dB values.',
    `${SEVERITY_DESC}. ${CATEGORY_DESC}.`,
    changesBlock,
    trackData,
    questionBlock,
    '',
    '## Required JSON structure',
    '{',
    '  "summary": "2-3 sentence overall assessment grounded in the data.",',
    '  "feedbackItems": [',
    ITEM_SCHEMA,
    '  ]',
    '}',
    '',
    'Aim for 8-12 items. At least 1 VALIDATION item. CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish.',
    'Tags must be short (1-3 words each), lowercase, specific (e.g. "sub-kick", "100-250hz", "mono compat", "crest factor").',
    changedFooter,
  ].join('\n')
}

function buildDeepScanPrompt(
  trackData: string,
  whatChanged: string | null | undefined,
) {
  const changesBlock = whatChanged
    ? `\n## What the producer changed\n${whatChanged}\nFor each category below, evaluate whether these changes are sonically sound. Validate correct choices, flag issues introduced.`
    : ''
  const deepItemSchema = `    {
      "id": "unique-kebab-slug",
      "timestamp": <number in seconds, or null if general>,
      "severity": <one of: "CRITICAL", "IMPORTANT", "MINOR", "VALIDATION">,
      "category": <one of: "Low End", "Mix Balance", "Arrangement", "Tension & Energy", "Stereo Width", "Vocals / Lead", "Master Check", "Next Steps">,
      "tags": ["short-tag-1", "short-tag-2"],
      "observation": "what the measured data shows — single specific issue, not a summary",
      "feedback": "actionable fix for this specific issue only"
    }`
  return [
    'You are a senior mastering and mixing engineer doing a comprehensive full-track deep scan.',
    '',
    'YOUR ENTIRE RESPONSE MUST BE A SINGLE RAW JSON OBJECT. No prose, no markdown, no code fences.',
    'Start your response with { and end with }. Nothing before or after.',
    'Base ALL feedback strictly on the measured data. Be specific: reference exact timestamps, section names, frequency ranges, and dB values.',
    `${SEVERITY_DESC}. ${CATEGORY_DESC}.`,
    '',
    'This is a DEEP SCAN — you must cover ALL eight categories below, producing dedicated feedback items for each.',
    'STRICT RULE — NO OVERLAP: Each feedback item must address ONE specific issue in ONE category.',
    'Before writing an item, check: has this exact observation already been made in another item or category? If yes, skip it.',
    'Every item must have a unique id slug. No two items may share the same observation or timestamp + topic combination.',
    changesBlock,
    trackData,
    '',
    '## Categories to cover (produce at least 2 items per category)',
    '1. Low End — sub/kick relationship, mud 100-250 Hz, bass translation on small speakers, low-end masking',
    '2. Mix Balance — overall level relationships, mid clutter, frequency masking between elements, anything unnatural',
    '3. Arrangement — section transitions, variation, intro/outro, drops and builds, stagnant energy zones',
    '4. Tension & Energy — energy arc, build-up effectiveness, premature tension release, momentum loss',
    '5. Stereo Width — field width, mono compatibility, element placement, phasing, low-end centering',
    '6. Vocals / Lead — lead element sit, burial or harshness 2-5 kHz, reverb/delay clarity, small-speaker cut-through',
    '7. Master Check — headroom (target -6 dBFS peak), dynamic range, clipping/distortion artefacts, loudness competitiveness',
    '8. Next Steps — 3-5 highest-priority actionable improvements ranked by impact, referencing timestamps and frequency ranges',
    '',
    '## Overlap prevention rules',
    '- Low End items: ONLY address sub/bass/kick frequency content. Do NOT discuss stereo width of bass here.',
    '- Stereo Width items: address width/mono/phase. Do NOT repeat frequency imbalance already covered in Mix Balance.',
    '- Mix Balance items: address relative levels and mid-range clutter. Do NOT re-describe issues covered in Low End.',
    '- Tension & Energy items: address the macro energy arc and dynamics over time. Do NOT repeat section timestamps already covered in Arrangement.',
    '- Master Check items: address output stage / loudness. Do NOT repeat frequency or dynamics issues covered elsewhere.',
    '- Next Steps items: reference previously identified issues by their id slug. Do NOT introduce new observations not already flagged.',
    '',
    '## Required JSON structure',
    '{',
    '  "summary": "3-4 sentence overall deep scan assessment grounded in the data.",',
    '  "feedbackItems": [',
    deepItemSchema,
    '  ]',
    '}',
    '',
    'Target 20-30 items total (2-4 per category + Next Steps). At least 2 VALIDATION items.',
    'CRITICAL = fix before release, IMPORTANT = meaningful improvement, MINOR = polish.',
    'Tags: short (1-3 words), lowercase, specific (e.g. "sub-kick", "100-250hz", "mono compat", "crest factor", "build tension").',
    'After generating all items, self-review: remove any item whose observation duplicates another. Rewrite any feedback that bleeds into another category.',
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const { supabase } = createRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single()

    if (settingsError) {
      if (settingsError.code !== 'PGRST116') {
        console.error('[analyse] user_settings fetch error:', settingsError)
        return NextResponse.json({ error: 'Could not retrieve settings. Try again.' }, { status: 500 })
      }
      return NextResponse.json({ error: 'No Anthropic API key set. Add one in Settings.' }, { status: 400 })
    }

    if (!settings) {
      return NextResponse.json({ error: 'No Anthropic API key set. Add one in Settings.' }, { status: 400 })
    }

    const apiKey = (settings as { anthropic_api_key: string }).anthropic_api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'No Anthropic API key set. Add one in Settings.' }, { status: 400 })
    }

    const body: AnalysePayload = await req.json()
    const {
      bpm, key, durationSeconds, sections, sectionsAreManual,
      energyCurve, spectral, fftBands, customQuestion, whatChanged,
      projectId, fileName, audioStoragePath, lufs,
    } = body

    const isDeepScan = customQuestion?.trim() === DEEP_SCAN_SENTINEL

    const trackData = buildTrackData(
      bpm, key, durationSeconds, sections, sectionsAreManual,
      energyCurve, spectral, fftBands, lufs ?? null,
    )

    const prompt = isDeepScan
      ? buildDeepScanPrompt(trackData, whatChanged)
      : buildStandardPrompt(trackData, customQuestion, whatChanged)

    const client = new Anthropic({ apiKey })
    const MAX_ATTEMPTS = 3
    let result: AnalysisResult | null = null
    let finalUsage = { input_tokens: 0, output_tokens: 0 }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const messages: Anthropic.MessageParam[] = attempt === 1
        ? [{ role: 'user', content: prompt }]
        : [
            { role: 'user', content: prompt },
            { role: 'assistant', content: '{' },
          ]

      let message: Anthropic.Message
      try {
        message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: isDeepScan ? 6000 : 4096,
          messages,
        })
      } catch (apiErr: unknown) {
        const e = apiErr as { status?: number; message?: string }
        console.error(`[analyse] Anthropic error (attempt ${attempt}):`, e?.status, e?.message)
        if (e?.status === 401) return NextResponse.json({ error: 'Invalid Anthropic API key. Update it in Settings.' }, { status: 500 })
        if (e?.status === 429) return NextResponse.json({ error: 'Rate limit — wait and retry.' }, { status: 429 })
        return NextResponse.json({ error: `API error ${e?.status}: ${e?.message}` }, { status: 500 })
      }

      if (message.stop_reason === 'max_tokens') {
        console.warn(`[analyse] response truncated by max_tokens (attempt ${attempt})`)
        if (attempt < MAX_ATTEMPTS) continue
        break
      }

      finalUsage = message.usage
      const rawText = (message.content[0] as { type: string; text: string }).text
      const raw = attempt > 1 ? '{' + rawText : rawText

      let parsed: { summary: string; feedbackItems: Omit<FeedbackItem, 'status'>[] } | null = null
      try {
        parsed = JSON.parse(extractJSON(raw))
      } catch (parseErr) {
        console.error(`[analyse] JSON parse failed (attempt ${attempt}): ${(parseErr as Error).message}\nRaw:`, raw.slice(0, 800))
        if (attempt < MAX_ATTEMPTS) continue
        break
      }

      const INPUT_RATE  = 3.00 / 1_000_000
      const OUTPUT_RATE = 15.00 / 1_000_000
      const inputTokens  = finalUsage.input_tokens
      const outputTokens = finalUsage.output_tokens
      const llmCostUsd   = inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE
      const infraCostUsd = 0.005
      const totalCostUsd = llmCostUsd + infraCostUsd

      result = {
        bpm, key, durationSeconds,
        lufs: lufs ?? null,
        sections,
        energyCurve,
        fftSpectrum: fftBands ?? [],
        summary: parsed!.summary,
        feedbackItems: parsed!.feedbackItems.map((item) => ({
          ...item,
          tags: item.tags ?? [],
          category: item.category ?? 'Mix Balance',
          status: 'pending' as const,
        })),
        costEstimate: { inputTokens, outputTokens, llmCostUsd, infraCostUsd, totalCostUsd, model: 'claude-sonnet-4-5' },
        isDeepScan,
      }
      break
    }

    if (!result) {
      return NextResponse.json({ error: `Claude returned malformed JSON after ${MAX_ATTEMPTS} attempts. Please try again.` }, { status: 500 })
    }

    if (projectId && fileName) {
      const { error: insertError } = await supabase.from('analyses').insert({
        user_id: user.id,
        project_id: projectId,
        file_name: fileName,
        analysed_at: new Date().toISOString(),
        audio_storage_path: audioStoragePath ?? null,
        lean_result: {
          bpm: result.bpm,
          key: result.key,
          durationSeconds: result.durationSeconds,
          lufs: result.lufs,
          summary: result.summary,
          feedbackItems: result.feedbackItems,
          sections: result.sections,
          costEstimate: result.costEstimate,
          isDeepScan: result.isDeepScan,
        },
      })
      if (insertError) {
        console.error('[analyse] analyses insert failed:', insertError, { userId: user.id, projectId, fileName })
        return NextResponse.json({ error: 'Analysis succeeded but could not be saved. Try again.' }, { status: 500 })
      }
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
