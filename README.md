# MixLens 🎛️

AI-powered audio analysis for Ableton producers. Upload a WAV/MP3 export and get timestamped mix, master, EQ, and arrangement feedback powered by Claude Opus.

## Stack

- **Next.js 15** + TypeScript + Bun
- **Tailwind CSS**
- **WaveSurfer.js** — waveform + playback
- **Meyda** — real-time RMS / spectral features
- **Essentia.js** — BPM + key detection (Web Worker)
- **Zustand** — client state
- **Anthropic SDK** — Claude Opus feedback

## Getting Started

```bash
bun install
bun dev
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=your_key_here
```

## MVP Features

- [ ] Upload WAV/MP3
- [ ] Waveform display + playback
- [ ] BPM + key detection
- [ ] Energy/loudness curve
- [ ] Auto section detection
- [ ] Claude Opus timestamped feedback
- [ ] Custom question input
- [ ] To-do / Ignore per feedback item
- [ ] Regenerate feedback
