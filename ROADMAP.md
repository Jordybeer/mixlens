# MixLens Roadmap

## v0.1 — foundation (now)
- [x] Project scaffold (Next.js 15, TypeScript, Bun, Tailwind)
- [x] Audio upload + drag & drop
- [x] WaveSurfer waveform + playback
- [x] RMS energy curve extraction
- [x] Naive section detection (intro, build, drop, breakdown, outro)
- [x] Claude Opus API route
- [x] Timestamped feedback cards with severity (CRITICAL / IMPORTANT / MINOR / VALIDATION)
- [x] Overall summary card
- [x] Add To-Do / Ignore per item
- [x] Custom question input
- [x] Zustand store

## v0.2 — real audio analysis
- [ ] Essentia.js Web Worker for BPM detection
- [ ] Essentia.js key detection (HPCP / chord profiles)
- [ ] Meyda spectral features (centroid, rolloff, flux)
- [ ] Loudness display (LUFS estimate)
- [ ] Energy curve chart (recharts or plain SVG)
- [ ] Section markers on waveform

## v0.3 — feedback quality
- [ ] Smarter section detection (onset detection vs. naive RMS)
- [ ] Feed spectral + dynamic range data into the Opus prompt
- [ ] Severity filter (show only CRITICAL + IMPORTANT)
- [ ] Regenerate feedback button
- [ ] To-Do list view (all flagged items in one place)

## v0.4 — UX polish
- [ ] Click timestamp on feedback card → seek waveform to that point
- [ ] Dark/light mode toggle
- [ ] Mobile-friendly layout
- [ ] Loading skeleton while analysing
- [ ] Error states (file too large, unsupported format, API failure)
- [ ] Copy feedback as markdown

## v0.5 — storage & history
- [ ] LocalStorage session persistence (last analysis survives refresh)
- [ ] Multiple track history (per-session, no account needed)
- [ ] Export feedback as PDF or markdown file

## v1.0 — stretch goals
- [ ] Stem analysis (separate kick, bass, synths via Web Audio routing)
- [ ] Reference track comparison (upload a reference, compare energy + frequency profiles)
- [ ] Ableton-specific tips in prompt context (detected section names map to Ableton arrangement view)
- [ ] Optional Supabase auth + cloud history
