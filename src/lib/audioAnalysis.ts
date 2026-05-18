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

export function detectSections(energyCurve: EnergyPoint[], duration: number): Section[] {
  if (energyCurve.length < 4) {
    return [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
  }
  const avg = energyCurve.reduce((s, p) => s + p.rms, 0) / energyCurve.length
  const sections: Section[] = []
  let sectionStart = 0
  let prevLabel = ''

  energyCurve.forEach((point, i) => {
    let label: string
    const ratio = point.rms / avg
    if (i === 0) label = 'intro'
    else if (i === energyCurve.length - 1) label = 'outro'
    else if (ratio < 0.3) label = 'breakdown'
    else if (ratio < 0.7) label = 'build'
    else label = 'drop'

    if (label !== prevLabel && prevLabel !== '') {
      sections.push({ label: prevLabel, startSeconds: sectionStart, endSeconds: point.time })
      sectionStart = point.time
    }
    prevLabel = label
  })
  sections.push({ label: prevLabel, startSeconds: sectionStart, endSeconds: duration })
  return sections
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
 * Returns 256 log-spaced bands from 20 Hz to 20 kHz with dB values.
 */
export async function extractFFTSpectrum(buffer: AudioBuffer): Promise<FFTBand[]> {
  const fftSize = 4096
  const sampleRate = buffer.sampleRate
  const channelData = buffer.getChannelData(0)
  const hopSize = fftSize * 4 // analyse every 4th frame for speed
  const numBins = fftSize / 2

  // Accumulate magnitude across frames
  const accumulated = new Float32Array(numBins)
  let frameCount = 0

  for (let offset = 0; offset + fftSize <= channelData.length; offset += hopSize) {
    const frame = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      // Hann window
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
      frame[i] = channelData[offset + i] * w
    }
    const magnitudes = dftMagnitude(frame)
    for (let i = 0; i < numBins; i++) accumulated[i] += magnitudes[i]
    frameCount++
  }

  if (frameCount === 0) return []

  // Average + convert to dB
  const avgDb = Array.from(accumulated).map((v) => {
    const avg = v / frameCount
    return avg > 0 ? 20 * Math.log10(avg) : -120
  })

  // Map to 120 log-spaced bands 20 Hz – 20 kHz
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
    const slice = avgDb.slice(
      Math.max(0, binLo),
      Math.min(numBins - 1, binHi + 1)
    )
    const db = slice.length > 0 ? Math.max(...slice) : -120
    bands.push({ freq: Math.round(freqCenter), db: Math.max(-80, Math.round(db)) })
  }

  return bands
}

/** Naive DFT magnitude — fast enough for 4096-point frames in a loop */
function dftMagnitude(frame: Float32Array): Float32Array {
  const N = frame.length
  const half = N / 2
  const real = new Float32Array(half)
  const imag = new Float32Array(half)
  // Use Web Crypto subtle or plain loop — plain loop fine for 4096
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
