# MixLens — Claude guidance

## Type checking
- `npm run build` — runs Next.js type check + lint (no local tsc binary)

## Essentia (BPM/key extraction)
- Worker lives at `/public/essentia-worker.js` — loaded via `new Worker('/essentia-worker.js')` in page.tsx
- `src/lib/essentiaWorker.ts` is a stub only (webpack exclusion)
- Include `runEssentiaWorker()` in the main `Promise.all` so it runs concurrently with spectral/FFT
- Always pass `bpm` to `detectSections(energyCurve, duration, bpm)`

## Analysis pipeline
- Per-user Anthropic API key from `user_settings.anthropic_api_key` (Supabase), not env vars
- `lean_result` in DB omits `fftSpectrum` and `energyCurve` (too large) — loaded from history as empty arrays
- `buildStandardPrompt` and `buildDeepScanPrompt` take `hasStereo`, `hasTruePeak`, `hasLufs` flags — derive before calling

## HistoryPanel
- Loading a history entry does NOT auto-navigate — pass `onLoad` callback to switch mode externally

## Branches
- Main: `main`
- Current feature: `feat/light-mode-audio-metrics` → subbranch `feat/bpm-section-detection-prompt-rewrite`
