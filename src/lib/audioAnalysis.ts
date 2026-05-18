import type { EnergyPoint, Section, FFTBand } from '@/types/analysis'

export async function extractEnergyCurve(
  buffer: AudioBuffer,
  windowSeconds = 1
): Promise<EnergyPoint[]> {
  const sampleRate = buffer.sampleRate
  const channelData = buffer.getChannelData(0)
  const windowSize = Math.floor(sampleRate * windowSeconds)
  const points: EnergyPoint[] = []
  for (let i = 0; i < channelData.length; i += windowSize) {
    const slice = channelData.slice(i, i + windowSize)
    const rms = Math.sqrt(slice.reduce((sum, s) => sum + s * s, 0) / slice.length)
    points.push({ time: i / sampleRate, rms })
  }
  return points
}

/**
 * Onset-strength section detection.
 * 1. Compute RMS per 1 s hop.
 * 2. Compute delta (frame-to-frame RMS change) — spike = onset.
 * 3. Smooth deltas with a 3-frame window.
 * 4. Threshold peaks to find structural boundaries.
 * 5. Label segments by relative energy vs. track mean.
 */
export function detectSections(energyCurve: EnergyPoint[], duration: number): Section[] {
  if (energyCurve.length < 6) {
    return [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
  }

  const rms = energyCurve.map((p) => p.rms)
  const times = energyCurve.map((p) => p.time)

  const delta = rms.map((v, i) => (i === 0 ? 0 : Math.abs(v - rms[i - 1])))
  const smooth = delta.map((v, i) =>
    (delta[Math.max(0, i - 1)] + v + delta[Math.min(delta.length - 1, i + 1)]) / 3
  )

  const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length
  const std = Math.sqrt(smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length)
  const threshold = mean + 0.6 * std

  const hop = times.length > 1 ? (times[1] - times[0]) : 1
  const minFrames = Math.ceil(8 / hop)

  const boundaries: number[] = [0]
  let lastBoundary = 0
  for (let i = 2; i < smooth.length - 2; i++) {
    if (
      smooth[i] > threshold &&
      smooth[i] >= smooth[i - 1] &&
      smooth[i] >= smooth[i + 1] &&
      i - lastBoundary >= minFrames
    ) {
      boundaries.push(i)
      lastBoundary = i
    }
  }
  boundaries.push(energyCurve.length - 1)

  const trackMean = rms.reduce((a, b) => a + b, 0) / rms.length
  const trackMax = Math.max(...rms)

  const sections: Section[] = []
  for (let b = 0; b < boundaries.length - 1; b++) {
    const startIdx = boundaries[b]
    const endIdx = boundaries[b + 1]
    const segRms = rms.slice(startIdx, endIdx + 1)
    const segMean = segRms.reduce((a, v) => a + v, 0) / segRms.length
    const ratio = segMean / trackMean
    const isFirst = b === 0
    const isLast = b === boundaries.length - 2
    const peakRatio = Math.max(...segRms) / trackMax

    let label: string
    if (isFirst && ratio < 0.85) label = 'intro'
    else if (isLast && ratio < 0.85) label = 'outro'
    else if (peakRatio > 0.85 && ratio > 1.1) label = 'drop'
    else if (ratio < 0.45) label = 'breakdown'
    else if (ratio < 0.85) label = 'build'
    else label = 'chorus'

    sections.push({
      label,
      startSeconds: times[startIdx],
      endSeconds: times[Math.min(endIdx, times.length - 1)],
    })
  }

  const merged: Section[] = []
  for (const s of sections) {
    if (merged.length > 0 && merged[merged.length - 1].label === s.label) {
      merged[merged.length - 1].endSeconds = s.endSeconds
    } else {
      merged.push({ ...s })
    }
  }

  return merged
}

export interface SpectralSummary {
  avgCentroid: number
  avgRolloff: number
  avgFlux: number
  dynamicRange: number
}

export async function extractSpectral(buffer: AudioBuffer): Promise<SpectralSummary> {
  try {
    const Meyda = (await import('meyda')).default
    const channelData = buffer.getChannelData(0)
    const bufferSize = 512
    const centroids: number[] = []
    const rolloffs: number[] = []
    const fluxes: number[] = []
    const rmsValues: number[] = []

    for (let i = 0; i + bufferSize < channelData.length; i += bufferSize) {
      const frame = Array.from(channelData.slice(i, i + bufferSize))
      const features = Meyda.extract(
        ['spectralCentroid', 'spectralRolloff', 'spectralFlux', 'rms'],
        frame
      ) as { spectralCentroid: number; spectralRolloff: number; spectralFlux: number; rms: number } | null
      if (features && features.spectralCentroid > 0) {
        centroids.push(features.spectralCentroid)
        rolloffs.push(features.spectralRolloff)
        fluxes.push(features.spectralFlux)
        rmsValues.push(features.rms)
      }
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const maxRms = Math.max(...rmsValues)
    const minRms = Math.min(...rmsValues.filter((v) => v > 0))
    const dynamicRange = maxRms > 0 && minRms > 0
      ? 20 * Math.log10(maxRms / minRms)
      : 0

    return {
      avgCentroid: avg(centroids) * buffer.sampleRate,
      avgRolloff: avg(rolloffs) * buffer.sampleRate,
      avgFlux: avg(fluxes),
      dynamicRange,
    }
  } catch {
    return { avgCentroid: 0, avgRolloff: 0, avgFlux: 0, dynamicRange: 0 }
  }
}

/**
 * Extract averaged FFT spectrum using OfflineAudioContext + AnalyserNode.
 * The browser's native FFT is hardware-accelerated — no O(N²) DFT, no freeze.
 * Samples every ~2 seconds across the full track and averages all frames.
 * Returns 120 log-spaced bands (20 Hz – 20 kHz) in dBFS.
 */
export async function extractFFTSpectrum(buffer: AudioBuffer): Promise<FFTBand[]> {
  const fftSize = 8192
  const sampleRate = buffer.sampleRate
  const duration = buffer.duration
  const hopSeconds = 2
  const numFrames = Math.max(1, Math.floor(duration / hopSeconds))

  // We render one frame at a time through an OfflineAudioContext.
  // Each render is short (fftSize samples) so it's fast.
  const frameLength = fftSize
  const accumulated = new Float32Array(fftSize / 2).fill(0)
  let validFrames = 0

  for (let f = 0; f < numFrames; f++) {
    const offsetSamples = Math.floor((f * hopSeconds + hopSeconds / 2) * sampleRate)
    if (offsetSamples + frameLength > buffer.length) break

    // Slice one frame into a new short OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(1, frameLength, sampleRate)
    const frameBuffer = offlineCtx.createBuffer(1, frameLength, sampleRate)
    const src = buffer.getChannelData(0)
    frameBuffer.copyToChannel(src.subarray(offsetSamples, offsetSamples + frameLength), 0)

    const source = offlineCtx.createBufferSource()
    source.buffer = frameBuffer

    const analyser = offlineCtx.createAnalyser()
    analyser.fftSize = fftSize
    analyser.smoothingTimeConstant = 0

    source.connect(analyser)
    analyser.connect(offlineCtx.destination)
    source.start(0)

    await offlineCtx.startRendering()

    const freqData = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(freqData)

    // Accumulate (values are dB, convert to linear power, average, convert back)
    for (let i = 0; i < freqData.length; i++) {
      const linear = Math.pow(10, freqData[i] / 10)
      accumulated[i] += linear
    }
    validFrames++
  }

  if (validFrames === 0) return []

  // Average and convert back to dB
  const avgDb = Array.from(accumulated).map((v) => {
    const avg = v / validFrames
    return avg > 0 ? 10 * Math.log10(avg) : -120
  })

  // Map to 120 log-spaced bands
  const NUM_BANDS = 120
  const logMin = Math.log10(20)
  const logMax = Math.log10(20000)
  const bands: FFTBand[] = []

  for (let b = 0; b < NUM_BANDS; b++) {
    const freqLo = Math.pow(10, logMin + (b / NUM_BANDS) * (logMax - logMin))
    const freqHi = Math.pow(10, logMin + ((b + 1) / NUM_BANDS) * (logMax - logMin))
    const freqCenter = Math.sqrt(freqLo * freqHi)
    const binLo = Math.floor((freqLo / sampleRate) * fftSize)
    const binHi = Math.ceil((freqHi / sampleRate) * fftSize)
    const slice = avgDb.slice(Math.max(0, binLo), Math.min(avgDb.length - 1, binHi + 1))
    const db = slice.length > 0 ? Math.max(...slice) : -120
    bands.push({ freq: Math.round(freqCenter), db: Math.max(-80, Math.round(db)) })
  }

  return bands
}

/**
 * Summarise FFT bands into a human + LLM-readable spectral balance string.
 */
export function summariseFFT(bands: FFTBand[]): string {
  if (!bands.length) return 'FFT data unavailable'

  const range = (lo: number, hi: number) =>
    bands.filter((b) => b.freq >= lo && b.freq < hi)

  const avgDb = (arr: FFTBand[]) =>
    arr.length ? arr.reduce((s, b) => s + b.db, 0) / arr.length : -80

  const sub    = avgDb(range(20,   80))
  const bass   = avgDb(range(80,   250))
  const lowMid = avgDb(range(250,  800))
  const mid    = avgDb(range(800,  2500))
  const hiMid  = avgDb(range(2500, 6000))
  const air    = avgDb(range(6000, 20000))

  const tilt = bass - air
  const tiltDesc = tilt > 20 ? 'heavily bottom-heavy'
    : tilt > 10 ? 'bottom-heavy'
    : tilt < -5 ? 'bright / top-heavy'
    : 'relatively balanced'

  const peaks: { freq: number; db: number }[] = []
  for (let i = 2; i < bands.length - 2; i++) {
    const b = bands[i]
    if (
      b.db > bands[i - 1].db &&
      b.db > bands[i + 1].db &&
      b.db > bands[i - 2].db &&
      b.db > bands[i + 2].db &&
      b.db > -50
    ) peaks.push({ freq: b.freq, db: b.db })
  }
  peaks.sort((a, b) => b.db - a.db)
  const topPeaks = peaks.slice(0, 4)
    .map((p) => `${p.freq < 1000 ? p.freq + ' Hz' : (p.freq / 1000).toFixed(1) + ' kHz'} (${p.db} dB)`)
    .join(', ')

  const mudWarning     = lowMid > mid + 8  ? ' WARNING: possible mud buildup in 250–800 Hz range.'   : ''
  const harshWarning   = hiMid  > mid + 6  ? ' WARNING: possible harshness in 2.5–6 kHz range.'      : ''
  const subWarning     = sub    > bass + 6 ? ' WARNING: sub may be overwhelming the bass.'            : ''

  return [
    `Spectral balance — sub: ${sub.toFixed(1)} dB | bass: ${bass.toFixed(1)} dB | low-mids: ${lowMid.toFixed(1)} dB | mids: ${mid.toFixed(1)} dB | hi-mids: ${hiMid.toFixed(1)} dB | air: ${air.toFixed(1)} dB`,
    `Spectral tilt: ${tiltDesc} (bass vs air delta: ${tilt.toFixed(1)} dB)`,
    topPeaks ? `Prominent peaks: ${topPeaks}` : '',
    mudWarning + harshWarning + subWarning,
  ].filter(Boolean).join('. ')
}

export function estimateLUFS(energyCurve: EnergyPoint[]): number | null {
  if (!energyCurve.length) return null
  const meanSquare = energyCurve.reduce((sum, p) => sum + p.rms * p.rms, 0) / energyCurve.length
  if (meanSquare <= 0) return null
  return Math.round(-0.691 + 10 * Math.log10(meanSquare))
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
