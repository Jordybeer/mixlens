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
 * 1. Compute RMS per 0.5 s hop.
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

  // Delta (onset strength)
  const delta = rms.map((v, i) => (i === 0 ? 0 : Math.abs(v - rms[i - 1])))

  // Smooth with 3-frame window
  const smooth = delta.map((v, i) =>
    (delta[Math.max(0, i - 1)] + v + delta[Math.min(delta.length - 1, i + 1)]) / 3
  )

  // Threshold = mean + 0.6 * std of smoothed delta
  const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length
  const std = Math.sqrt(smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length)
  const threshold = mean + 0.6 * std

  // Minimum section length = 8 s → frames
  const hop = times.length > 1 ? (times[1] - times[0]) : 1
  const minFrames = Math.ceil(8 / hop)

  // Collect boundary indices
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

  // Label each segment
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

  // Merge adjacent identical labels (clean up artefacts)
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
 * Extract averaged FFT magnitude spectrum across the full track.
 * Returns 120 log-spaced bands from 20 Hz to 20 kHz with dB values.
 */
export async function extractFFTSpectrum(buffer: AudioBuffer): Promise<FFTBand[]> {
  const fftSize = 4096
  const sampleRate = buffer.sampleRate
  const channelData = buffer.getChannelData(0)
  const hopSize = fftSize * 4
  const numBins = fftSize / 2

  const accumulated = new Float32Array(numBins)
  let frameCount = 0

  for (let offset = 0; offset + fftSize <= channelData.length; offset += hopSize) {
    const frame = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
      frame[i] = channelData[offset + i] * w
    }
    const magnitudes = dftMagnitude(frame)
    for (let i = 0; i < numBins; i++) accumulated[i] += magnitudes[i]
    frameCount++
  }

  if (frameCount === 0) return []

  const avgDb = Array.from(accumulated).map((v) => {
    const avg = v / frameCount
    return avg > 0 ? 20 * Math.log10(avg) : -120
  })

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
    const slice = avgDb.slice(Math.max(0, binLo), Math.min(numBins - 1, binHi + 1))
    const db = slice.length > 0 ? Math.max(...slice) : -120
    bands.push({ freq: Math.round(freqCenter), db: Math.max(-80, Math.round(db)) })
  }

  return bands
}

/** Naive DFT magnitude — 4096-point */
function dftMagnitude(frame: Float32Array): Float32Array {
  const N = frame.length
  const half = N / 2
  const real = new Float32Array(half)
  const imag = new Float32Array(half)
  for (let k = 0; k < half; k++) {
    let re = 0, im = 0
    const angle = (2 * Math.PI * k) / N
    for (let n = 0; n < N; n++) {
      re += frame[n] * Math.cos(angle * n)
      im -= frame[n] * Math.sin(angle * n)
    }
    real[k] = re
    imag[k] = im
  }
  const mag = new Float32Array(half)
  for (let k = 0; k < half; k++) {
    mag[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]) / N
  }
  return mag
}

/**
 * Summarise FFT bands into a human + LLM-readable spectral balance string.
 * Groups into sub/low-mid/presence/air, finds prominent peaks.
 */
export function summariseFFT(bands: FFTBand[]): string {
  if (!bands.length) return 'FFT data unavailable'

  const range = (lo: number, hi: number) =>
    bands.filter((b) => b.freq >= lo && b.freq < hi)

  const avgDb = (arr: FFTBand[]) =>
    arr.length ? arr.reduce((s, b) => s + b.db, 0) / arr.length : -80

  const sub     = avgDb(range(20,   80))    // sub bass
  const bass    = avgDb(range(80,   250))   // bass / upper bass
  const lowMid  = avgDb(range(250,  800))   // low-mids / mud zone
  const mid     = avgDb(range(800,  2500))  // mids / presence
  const hiMid   = avgDb(range(2500, 6000))  // upper mids / harshness zone
  const air     = avgDb(range(6000, 20000)) // air / high-end

  // Spectral tilt: difference between bass and air (positive = bottom-heavy)
  const tilt = bass - air
  const tiltDesc = tilt > 20 ? 'heavily bottom-heavy'
    : tilt > 10 ? 'bottom-heavy'
    : tilt < -5 ? 'bright / top-heavy'
    : 'relatively balanced'

  // Find top 3 prominent peaks (local maxima with >= 6 dB above neighbours)
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

  // Mud detection: low-mid significantly louder than mids
  const mudWarning = lowMid > mid + 8 ? ' WARNING: possible mud buildup in 250–800 Hz range.' : ''
  // Harshness detection
  const harshWarning = hiMid > mid + 6 ? ' WARNING: possible harshness in 2.5–6 kHz range.' : ''
  // Sub/kick imbalance
  const subWarning = sub > bass + 6 ? ' WARNING: sub may be overwhelming the bass.' : ''

  return [
    `Spectral balance — sub: ${sub.toFixed(1)} dB | bass: ${bass.toFixed(1)} dB | low-mids: ${lowMid.toFixed(1)} dB | mids: ${mid.toFixed(1)} dB | hi-mids: ${hiMid.toFixed(1)} dB | air: ${air.toFixed(1)} dB`,
    `Spectral tilt: ${tiltDesc} (bass vs air delta: ${tilt.toFixed(1)} dB)`,
    topPeaks ? `Prominent peaks: ${topPeaks}` : '',
    mudWarning + harshWarning + subWarning,
  ].filter(Boolean).join('. ')
}

// Approximate integrated LUFS from RMS energy curve (simplified ITU-R BS.1770)
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
