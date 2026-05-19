import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRouteHandlerClient } from '@/lib/supabase'
import type { EnergyPoint, Section, FeedbackItem, AnalysisResult, FFTBand, StereoSummary } from '@/types/analysis'
import { summariseFFT } from '@/lib/audioAnalysis'

interface SpectralSummary {
  avgCentroid: number
  avgRolloff: number
  avgFlux: number
  dynamicRange: number
  peakDbfs: number | null
  rmsDbfs: number | null
  truePeakDbfs: number | null
  clipCount: number
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
  stereo?: StereoSummary | null
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
  stereo: StereoSummary | null | undefined,
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
      `Peak: ${spectral.peakDbfs.toFixed(1)} dBFS (sample)${loudnessNote}`,
      spectral.truePeakDbfs != null ? `True peak: ${spectral.truePeakDbfs.toFixed(1)} dBFS` : null,
      `Integrated RMS: ${spectral.rmsDbfs.toFixed(1)} dBFS`,
      `Crest factor: ${spectral.dynamicRange.toFixed(1)} dB`,
      lufs != null ? `Integrated loudness: ${lufs} LUFS (ITU-R BS.1770-3)` : null,
      spectral.clipCount > 0 ? `WARNING: ${spectral.clipCount} clip event(s) detected (flat-top)` : null,
      spectral.avgFlux > 0 ? `Spectral flux: ${spectral.avgFlux.toFixed(4)}` : null,
    ].filter(Boolean).join(' | ')
  } else {
    loudnessLine = [
      lufs != null ? `Integrated loudness: ${lufs} LUFS (ITU-R BS.1770-3)` : 'Loudness data unavailable',
      `Energy crest factor: ${crestFactor} dB`,
    ].filter(Boolean).join(' | ')
  }

  const fftSummary = fftBands?.length ? summariseFFT(fftBands) : 'FFT data unavailable'

  const stereoLine = stereo
    ? `correlation ${stereo.correlation.toFixed(2)} | mid ${stereo.midDbfs?.toFixed(1) ?? 'n/a'} dBFS | side ${stereo.sideDbfs?.toFixed(1) ?? 'n/a'} dBFS | width ~${stereo.widthPercent}%`
    : 'mono signal'

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
    '',
    '## Stereo',
    `- ${stereoLine}`,
  ].join('\n')
}

const ITEM_SCHEMA = `    {
      "id": "unique-kebab-slug",
      "timestamp": <seconds as number, or null if not section-specific>,
      "severity": <"CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION">,
      "category": <"Low End" | "Mix Balance" | "Arrangement" | "Tension & Energy" | "Dynamics" | "Stereo Width" | "Vocals / Lead" | "Master Check" | "Next Steps">,
      "confidence": <"high" | "medium" | "low">,
      "tags": ["short-tag-1", "short-tag-2"],
      "observation": "a specific measured fact — cite the number or data point that supports this",
      "feedback": "practical action in producer language — direction not prescription"
    }`

function buildStandardPrompt(
  trackData: string,
  customQuestion: string | undefined,
  whatChanged: string | null | undefined,
  hasStereo: boolean,
  hasTruePeak: boolean,
  hasLufs: boolean,
) {
  const changesBlock = whatChanged
    ? `\n## What the producer changed\n${whatChanged}\nFor each change, evaluate whether it achieved its goal. Validate correct choices. Flag anything it broke or left unresolved.`
    : ''
  const questionBlock = customQuestion?.trim()
    ? `\n## Specific question from the producer\n"${customQuestion}"`
    : ''

  return [
    'You are a trusted senior mixing and mastering engineer reviewing a mix.',
    "Tone: direct, practical, producer-to-producer. No academic jargon. Write like you're giving feedback in a session.",
    "Use language like: \"the kick is sitting too close to the bass around 80 Hz\", \"this build loses momentum\", \"pull back some 300 Hz to clear the mud\" — not \"spectral centroid analysis indicates sub-dominant frequency concentration\".",
    '',
    'YOUR ENTIRE RESPONSE MUST BE A SINGLE RAW JSON OBJECT. No prose, no markdown, no code fences.',
    'Start with { and end with }. Nothing before or after.',
    '',
    '## What you may claim',
    '- Level/loudness issues: only from peakDbfs, rmsDbfs, truePeakDbfs (if present), clipCount, LUFS (if present), crest factor.',
    '- Spectral balance issues: only from the FFT band averages and named warnings in the data.',
    '- Dynamic range issues: only from crest factor, LUFS, and energy curve shape.',
    hasStereo
      ? '- Stereo/width/mono issues: only from the correlation value and widthPercent in the stereo data.'
      : '- Mono signal — do not make any stereo, width, phase, or mono compatibility claims.',
    !hasTruePeak ? '- No true-peak data available — do not reference true-peak values. Sample peak only.' : null,
    !hasLufs ? '- No LUFS measurement available — do not make integrated loudness claims.' : null,
    '',
    '## Hard rules — violating these is a critical error',
    '1. Never claim width, correlation, phase, or mono compatibility without stereo data present.',
    '2. Never call a sample peak a true peak. Only mention true peak if truePeakDbfs is in the data.',
    '3. Never suggest a corrupt file, export bug, or technical error based on silence or low RMS alone.',
    '4. Never cite specific streaming LUFS targets (e.g. "Spotify targets -14 LUFS") unless measured LUFS is within 3 dB of that figure.',
    '5. No fixed RMS targets. Use crest factor and LUFS as context for dynamic feel.',
    '6. Suggest EQ directions, not precise amounts: "pull back around 250 Hz" — not "cut 7 dB at 250 Hz".',
    '7. Use "may", "suggests", "could indicate", "worth checking" when evidence is indirect. Set confidence to "medium" or "low" for those items.',
    '',
    '## Confidence guide',
    '"high" — directly measured (e.g. clipCount > 0, peakDbfs is -1.2, correlation is 0.98)',
    '"medium" — inferred from related or averaged data (e.g. FFT suggests mud, energy curve suggests a low-energy plateau)',
    '"low" — speculative or coarse data (e.g. auto-estimated section label, centroid approximation)',
    '',
    'Valid severity: "CRITICAL" (fix before release), "IMPORTANT" (meaningful improvement), "MINOR" (polish), "VALIDATION" (confirms something working well).',
    'Valid categories: "Low End", "Mix Balance", "Arrangement", "Tension & Energy", "Dynamics", "Stereo Width", "Vocals / Lead", "Master Check", "Next Steps".',
    changesBlock,
    trackData,
    questionBlock,
    '',
    '## Required JSON structure',
    '{',
    '  "summary": "2-3 sentences. Overall read on the mix in plain producer language. Ground it in the measured data.",',
    '  "feedbackItems": [',
    ITEM_SCHEMA,
    '  ]',
    '}',
    '',
    'Aim for 8-12 items. Include at least 1 VALIDATION item.',
    'Tags: 1-3 words, lowercase, specific (e.g. "sub-kick", "100-250hz", "crest factor", "mono compat").',
  ].filter(Boolean).join('\n')
}

function buildDeepScanPrompt(
  trackData: string,
  whatChanged: string | null | undefined,
  hasStereo: boolean,
  hasTruePeak: boolean,
  hasLufs: boolean,
) {
  const changesBlock = whatChanged
    ? `\n## What the producer changed\n${whatChanged}\nFor each category below, evaluate whether these changes achieved their goal. Validate correct choices, flag issues introduced.`
    : ''
  const deepItemSchema = `    {
      "id": "unique-kebab-slug",
      "timestamp": <seconds as number, or null if not section-specific>,
      "severity": <"CRITICAL" | "IMPORTANT" | "MINOR" | "VALIDATION">,
      "category": <"Low End" | "Mix Balance" | "Arrangement" | "Tension & Energy" | "Dynamics" | "Stereo Width" | "Vocals / Lead" | "Master Check" | "Next Steps">,
      "confidence": <"high" | "medium" | "low">,
      "tags": ["short-tag-1", "short-tag-2"],
      "observation": "a specific measured fact — cite the number or data point that supports this",
      "feedback": "practical action in producer language — direction not prescription"
    }`

  return [
    'You are a trusted senior mixing and mastering engineer doing a comprehensive deep scan.',
    "Tone: direct, practical, producer-to-producer. No academic jargon. Write like you're giving detailed session feedback.",
    "Use language like: \"the kick is sitting too close to the bass around 80 Hz\", \"this build loses momentum at 1:20\", \"pull back some 300 Hz to clear the mud\" — not \"spectral centroid analysis indicates sub-dominant frequency concentration\".",
    '',
    'YOUR ENTIRE RESPONSE MUST BE A SINGLE RAW JSON OBJECT. No prose, no markdown, no code fences.',
    'Start with { and end with }. Nothing before or after.',
    '',
    '## What you may claim',
    '- Level/loudness issues: only from peakDbfs, rmsDbfs, truePeakDbfs (if present), clipCount, LUFS (if present), crest factor.',
    '- Spectral balance issues: only from the FFT band averages and named warnings in the data.',
    '- Dynamic range issues: only from crest factor, LUFS, and energy curve shape.',
    hasStereo
      ? '- Stereo/width/mono issues: only from the correlation value and widthPercent in the stereo data.'
      : '- Mono signal — do not make any stereo, width, phase, or mono compatibility claims. Skip the Stereo Width category entirely.',
    !hasTruePeak ? '- No true-peak data available — do not reference true-peak values. Sample peak only.' : null,
    !hasLufs ? '- No LUFS measurement available — do not make integrated loudness claims.' : null,
    '',
    '## Hard rules — violating these is a critical error',
    '1. Never claim width, correlation, phase, or mono compatibility without stereo data present.',
    '2. Never call a sample peak a true peak. Only mention true peak if truePeakDbfs is in the data.',
    '3. Never suggest a corrupt file, export bug, or technical error based on silence or low RMS alone.',
    '4. Never cite specific streaming LUFS targets unless measured LUFS is within 3 dB of that figure.',
    '5. No fixed RMS targets. Use crest factor and LUFS to discuss dynamic feel.',
    '6. Suggest EQ directions, not precise amounts.',
    '7. Use "may", "suggests", "could indicate", "worth checking" for indirect evidence. Set confidence to "medium" or "low".',
    '8. Each item addresses ONE specific issue in ONE category only.',
    '',
    '## Confidence guide',
    '"high" — directly measured (e.g. clipCount > 0, peakDbfs is -1.2, correlation is 0.98)',
    '"medium" — inferred from related or averaged data (e.g. FFT suggests mud, energy curve suggests stagnant section)',
    '"low" — speculative or coarse data (e.g. auto-estimated section label, centroid approximation)',
    '',
    'Valid severity: "CRITICAL" (fix before release), "IMPORTANT" (meaningful improvement), "MINOR" (polish), "VALIDATION" (confirms something working well).',
    'Valid categories: "Low End", "Mix Balance", "Arrangement", "Tension & Energy", "Dynamics", "Stereo Width", "Vocals / Lead", "Master Check", "Next Steps".',
    '',
    'This is a DEEP SCAN — cover ALL applicable categories below with at least 2 items each.',
    "STRICT: Each item addresses ONE specific issue. No item may duplicate another's observation.",
    changesBlock,
    trackData,
    '',
    '## Categories to cover',
    '1. Low End — sub/kick relationship, mud in 100-250 Hz, bass translation on small speakers',
    '2. Mix Balance — level relationships, mid-range clutter, frequency masking between elements',
    '3. Arrangement — section transitions, energy variation, intro/outro, stagnant zones',
    '4. Tension & Energy — energy arc across the track, build effectiveness, momentum',
    '5. Dynamics — macro dynamic range, crest factor, compression feel, limiting artefacts',
    hasStereo
      ? '6. Stereo Width — correlation value, mid/side balance, width estimate, mono compatibility, low-end centering'
      : '6. Stereo Width — SKIP (mono signal)',
    '7. Vocals / Lead — lead element presence, burial or harshness, reverb/delay clarity',
    '8. Master Check — headroom, clipping, loudness relative to measured peak/LUFS',
    '9. Next Steps — 3-5 highest-priority fixes ranked by impact, referencing item ids',
    '',
    '## Overlap prevention',
    '- Low End: ONLY sub/bass/kick frequency content.',
    '- Dynamics: macro dynamic range and crest factor only. Not energy arc (that\'s Tension & Energy).',
    hasStereo ? '- Stereo Width: correlation/width from stereo data only. Not frequency imbalance (that\'s Mix Balance).' : null,
    '- Mix Balance: relative levels and mid-range clutter. Not Low End content.',
    '- Tension & Energy: macro energy arc over time. Not section timestamps (that\'s Arrangement).',
    '- Master Check: output stage, loudness, peak. Not frequency or dynamics already covered elsewhere.',
    '- Next Steps: reference previously identified item ids only. No new observations.',
    '',
    '## Required JSON structure',
    '{',
    '  "summary": "3-4 sentences. Overall read on the mix in plain producer language. Ground it in the data.",',
    '  "feedbackItems": [',
    deepItemSchema,
    '  ]',
    '}',
    '',
    'Target 22-36 items (2-4 per category + Next Steps). At least 2 VALIDATION items.',
    'Tags: 1-3 words, lowercase, specific.',
    'Self-review after generating: remove any item whose observation duplicates another. Rewrite any feedback that bleeds into another category.',
  ].filter(Boolean).join('\n')
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
      projectId, fileName, audioStoragePath, lufs, stereo,
    } = body

    const isDeepScan = customQuestion?.trim() === DEEP_SCAN_SENTINEL
    const hasStereo = stereo != null
    const hasTruePeak = spectral?.truePeakDbfs != null
    const hasLufs = lufs != null

    const trackData = buildTrackData(
      bpm, key, durationSeconds, sections, sectionsAreManual,
      energyCurve, spectral, fftBands, lufs ?? null, stereo,
    )

    const prompt = isDeepScan
      ? buildDeepScanPrompt(trackData, whatChanged, hasStereo, hasTruePeak, hasLufs)
      : buildStandardPrompt(trackData, customQuestion, whatChanged, hasStereo, hasTruePeak, hasLufs)

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
          max_tokens: isDeepScan ? 12000 : 4096,
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
          confidence: item.confidence ?? 'medium',
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
