# MixLens Roadmap

## v0.1 — foundation ✅
- [x] Project scaffold (Next.js 15, TypeScript, Bun, Tailwind)
- [x] Audio upload + drag & drop
- [x] WaveSurfer waveform + playback
- [x] RMS energy curve extraction
- [x] Naive section detection (intro, build, drop, breakdown, outro)
- [x] Claude Sonnet API route
- [x] Timestamped feedback cards with severity
- [x] Overall summary card
- [x] Add To-Do / Ignore per item
- [x] Custom question input
- [x] Zustand store

## v0.2 — real audio analysis ✅
- [x] Essentia.js Web Worker for BPM + key detection
- [x] Meyda spectral features (centroid, rolloff, flux, dynamic range)
- [x] LUFS estimate display (colour-coded)
- [x] Energy curve SVG chart with section bands
- [x] Section markers on waveform
- [x] Spectral data fed into prompt

## v0.3 — feedback quality ✅
- [x] Severity filter tabs with counts
- [x] Regenerate / re-analyse button
- [x] Todo list view with count badge
- [x] Click timestamp → seek waveform
- [x] LocalStorage persistence (result survives refresh)
- [x] Error states (file too large, unsupported format, decode fail, API errors)
- [x] Copy feedback as markdown
- [x] Multi-track session history (last 10, dropdown)
- [x] iOS Safari file picker fix

## v0.4 — UX polish
- [ ] Dark/light mode toggle
- [ ] Export feedback as PDF
- [ ] Waveform region highlighting per section
- [ ] Animate feedback cards on load
- [ ] Settings panel (model selection, prompt tweaks)

## v0.5 — advanced analysis
- [ ] Smarter onset-based section detection
- [ ] Stem-level analysis (kick, bass, synths routed separately)
- [ ] Reference track comparison (upload ref, compare energy + spectrum)
- [ ] Ableton-specific prompt context (section names → arrangement view hints)

## v1.0 — storage & sharing
- [ ] Export as shareable link (Supabase optional)
- [ ] Per-track notes / producer journal
- [ ] Optional cloud history + auth
