import type { EnergyPoint, Section, FFTBand, StereoSummary } from '@/types/analysis'

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

export async function extractStructuralBoundaries(
  buffer: AudioBuffer,
  minGapSeconds = 8,
): Promise<number[]> {
  try {
    const Meyda = (await import('meyda')).default
    const channelData = buffer.getChannelData(0)
    const sampleRate = buffer.sampleRate
    const bufferSize = 512
    const fluxValues: number[] = []
    const times: number[] = []

    for (let i = 0; i + bufferSize < channelData.length; i += bufferSize) {
      const frame = Array.from(channelData.slice(i, i + bufferSize))
      const features = Meyda.extract(['spectralFlux'], frame) as { spectralFlux: number } | null
      if (features && isFinite(features.spectralFlux)) {
        fluxValues.push(features.spectralFlux)
        times.push(i / sampleRate)
      }
    }

    if (fluxValues.length < 4) return []

    const smooth = fluxValues.map((v, i) =>
      (fluxValues[Math.max(0, i - 1)] + v + fluxValues[Math.min(fluxValues.length - 1, i + 1)]) / 3
    )

    const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length
    const std = Math.sqrt(smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length)
    const threshold = mean + 1.2 * std
    const minFrames = Math.ceil((minGapSeconds * sampleRate) / bufferSize)

    const boundaries: number[] = []
    let lastBoundary = 0
    for (let i = 2; i < smooth.length - 2; i++) {
      if (
        smooth[i] > threshold &&
        smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1] &&
        i - lastBoundary >= minFrames
      ) {
        boundaries.push(times[i])
        lastBoundary = i
      }
    }
    return boundaries
  } catch {
    return []
  }
}

export function detectSections(
  energyCurve: EnergyPoint[],
  duration: number,
  bpm?: number | null,
  noveltyBoundaries?: number[],
): Section[] {
  if (noveltyBoundaries && noveltyBoundaries.length > 0) {
    const rms = energyCurve.map((p) => p.rms)
    const trackMean = rms.length ? rms.reduce((a, b) => a + b, 0) / rms.length : 0
    const trackMax = rms.length ? Math.max(...rms) : 1
    const hop = energyCurve.length > 1 ? (energyCurve[1].time - energyCurve[0].time) : 1
    const allStarts = [0, ...noveltyBoundaries]
    const sections: Section[] = []
    for (let b = 0; b < allStarts.length; b++) {
      const startSec = allStarts[b]
      const endSec = b < allStarts.length - 1 ? allStarts[b + 1] : duration
      const startIdx = Math.round(startSec / hop)
      const endIdx = Math.round(endSec / hop)
      const segRms = rms.slice(startIdx, endIdx + 1)
      const segMean = segRms.length ? segRms.reduce((a, v) => a + v, 0) / segRms.length : 0
      const peakRatio = segRms.length ? Math.max(...segRms) / (trackMax || 1) : 0
      const ratio = trackMean > 0 ? segMean / trackMean : 1
      const isFirst = b === 0
      const isLast = b === allStarts.length - 1
      let label: string
      if (isFirst && allStarts.length > 1) label = 'intro'
      else if (isLast && ratio < 0.75) label = 'outro'
      else if (peakRatio > 0.88 && ratio > 1.05) label = 'drop'
      else if (ratio < 0.45) label = 'breakdown'
      else if (ratio < 0.80) label = 'build'
      else label = 'chorus'
      sections.push({ label, startSeconds: startSec, endSeconds: endSec })
    }
    return sections.length > 0 ? sections : [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
  }

  if (energyCurve.length < 4) {
    return [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
  }

  const rms = energyCurve.map((p) => p.rms)
  const times = energyCurve.map((p) => p.time)
  const hop = times.length > 1 ? (times[1] - times[0]) : 1

  const trackMean = rms.reduce((a, b) => a + b, 0) / rms.length
  const trackMax = Math.max(...rms)

  let boundaries: number[]

  if (bpm && bpm > 60 && bpm < 220) {
    // BPM-aware: snap candidate boundaries to 4-bar phrase grid
    const barDur = (60 / bpm) * 4       // one 4/4 bar in seconds
    const phraseDur = barDur * 4         // 16-beat phrase
    const minPhraseSec = barDur * 2      // minimum 2 bars between boundaries
    const windowFrames = Math.max(2, Math.round(barDur / hop))

    const candidates: number[] = []
    let t = phraseDur
    while (t < duration - minPhraseSec) {
      const frameIdx = Math.round(t / hop)
      if (frameIdx > 0 && frameIdx < rms.length) candidates.push(frameIdx)
      t += phraseDur
    }

    const deltas = candidates.map((idx) => {
      const before = rms.slice(Math.max(0, idx - windowFrames), idx)
      const after = rms.slice(idx, Math.min(rms.length, idx + windowFrames))
      const avgBefore = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0
      const avgAfter = after.length ? after.reduce((a, b) => a + b, 0) / after.length : 0
      return Math.abs(avgAfter - avgBefore)
    })

    const meanDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0
    const stdDelta = deltas.length
      ? Math.sqrt(deltas.reduce((a, b) => a + (b - meanDelta) ** 2, 0) / deltas.length)
      : 0
    const threshold = meanDelta + 0.4 * stdDelta

    boundaries = [0]
    let lastBoundary = 0
    const minFrames = Math.ceil(minPhraseSec / hop)
    for (let i = 0; i < candidates.length; i++) {
      const idx = candidates[i]
      if (deltas[i] >= threshold && idx - lastBoundary >= minFrames) {
        boundaries.push(idx)
        lastBoundary = idx
      }
    }
  } else {
    // Energy-only fallback
    const minSectionSeconds = Math.max(4, Math.min(16, duration * 0.10))
    const minFrames = Math.ceil(minSectionSeconds / hop)

    const delta = rms.map((v, i) => (i === 0 ? 0 : Math.abs(v - rms[i - 1])))
    const smooth = delta.map((v, i) =>
      (delta[Math.max(0, i - 1)] + v + delta[Math.min(delta.length - 1, i + 1)]) / 3
    )
    const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length
    const std = Math.sqrt(smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length)
    const threshold = mean + 1.0 * std

    boundaries = [0]
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
  }

  const totalSections = boundaries.length
  const sections: Section[] = []

  for (let b = 0; b < boundaries.length; b++) {
    const startIdx = boundaries[b]
    const endTime = b < boundaries.length - 1
      ? (times[boundaries[b + 1]] ?? duration)
      : duration
    const endIdx = b < boundaries.length - 1 ? boundaries[b + 1] : rms.length - 1
    const segRms = rms.slice(startIdx, endIdx + 1)
    if (segRms.length === 0) continue

    const segMean = segRms.reduce((a, v) => a + v, 0) / segRms.length
    const ratio = segMean / trackMean
    const isFirst = b === 0
    const isLast = b === boundaries.length - 1
    const peakRatio = Math.max(...segRms) / trackMax

    let label: string
    if (isFirst && totalSections > 1) {
      label = 'intro'
    } else if (isLast && ratio < 0.75) {
      label = 'outro'
    } else if (peakRatio > 0.88 && ratio > 1.05) {
      label = 'drop'
    } else if (ratio < 0.45) {
      label = 'breakdown'
    } else if (ratio < 0.80) {
      label = 'build'
    } else {
      label = 'chorus'
    }

    sections.push({ label, startSeconds: times[startIdx] ?? 0, endSeconds: endTime })
  }

  if (sections.length === 0) {
    return [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
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
  peakDbfs: number | null
  rmsDbfs: number | null
  truePeakDbfs: number | null
  clipCount: number
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

    let sumSquares = 0
    let peakAmp = 0
    let clipCount = 0
    let consecutive = 0
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i])
      if (abs > peakAmp) peakAmp = abs
      sumSquares += channelData[i] * channelData[i]
      if (abs >= 0.9999) {
        consecutive++
        if (consecutive === 2) clipCount++
      } else {
        consecutive = 0
      }
    }
    const integratedRms = Math.sqrt(sumSquares / channelData.length)

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

    const peakDbfs = peakAmp > 0 ? 20 * Math.log10(peakAmp) : null
    const rmsDbfs = integratedRms > 0 ? 20 * Math.log10(integratedRms) : null
    const dynamicRange =
      peakDbfs != null && rmsDbfs != null ? peakDbfs - rmsDbfs : 0

    // True-peak via 4× oversampling (inter-sample peak detection)
    let truePeakDbfs: number | null = null
    try {
      const tpCtx = new OfflineAudioContext(1, buffer.length * 4, buffer.sampleRate * 4)
      const tpBuf = tpCtx.createBuffer(1, buffer.length, buffer.sampleRate)
      tpBuf.copyToChannel(channelData, 0)
      const tpSrc = tpCtx.createBufferSource()
      tpSrc.buffer = tpBuf
      tpSrc.connect(tpCtx.destination)
      tpSrc.start(0)
      const tpRendered = await tpCtx.startRendering()
      const tpData = tpRendered.getChannelData(0)
      let tpPeak = 0
      for (let i = 0; i < tpData.length; i++) {
        const abs = Math.abs(tpData[i])
        if (abs > tpPeak) tpPeak = abs
      }
      truePeakDbfs = tpPeak > 0 ? parseFloat((20 * Math.log10(tpPeak)).toFixed(2)) : null
    } catch { /* best-effort */ }

    return {
      avgCentroid: centroids.length ? avg(centroids) * buffer.sampleRate : 0,
      avgRolloff: rolloffs.length ? avg(rolloffs) * buffer.sampleRate : 0,
      avgFlux: fluxes.length ? avg(fluxes) : 0,
      dynamicRange,
      peakDbfs: peakDbfs != null ? parseFloat(peakDbfs.toFixed(2)) : null,
      rmsDbfs: rmsDbfs != null ? parseFloat(rmsDbfs.toFixed(2)) : null,
      truePeakDbfs,
      clipCount,
    }
  } catch (err) {
    console.error('[extractSpectral] Meyda error:', err)
    return { avgCentroid: 0, avgRolloff: 0, avgFlux: 0, dynamicRange: 0, peakDbfs: null, rmsDbfs: null, truePeakDbfs: null, clipCount: 0 }
  }
}

/**
 * Extract averaged FFT spectrum using OfflineAudioContext + AnalyserNode.
 * Native browser FFT — no freeze, no O(N²).
 * Samples every ~2 seconds, averages all frames.
 * Returns 120 log-spaced bands (20 Hz–20 kHz) in dBFS.
 */
export async function extractFFTSpectrum(buffer: AudioBuffer): Promise<FFTBand[]> {
  const fftSize = 8192
  const sampleRate = buffer.sampleRate
  const duration = buffer.duration
  const hopSeconds = 2
  const numFrames = Math.max(1, Math.floor(duration / hopSeconds))

  const frameLength = fftSize
  const accumulated = new Float32Array(fftSize / 2).fill(0)
  let validFrames = 0

  for (let f = 0; f < numFrames; f++) {
    const offsetSamples = Math.floor((f * hopSeconds + hopSeconds / 2) * sampleRate)
    if (offsetSamples + frameLength > buffer.length) break

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

    for (let i = 0; i < freqData.length; i++) {
      accumulated[i] += Math.pow(10, freqData[i] / 10)
    }
    validFrames++
  }

  if (validFrames === 0) return []

  const avgDb = Array.from(accumulated).map((v) => {
    const avg = v / validFrames
    return avg > 0 ? 10 * Math.log10(avg) : -120
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
    const slice = avgDb.slice(Math.max(0, binLo), Math.min(avgDb.length - 1, binHi + 1))
    const db = slice.length > 0 ? Math.max(...slice) : -120
    bands.push({ freq: Math.round(freqCenter), db: Math.max(-80, Math.round(db)) })
  }

  return bands
}

/**
 * Summarise FFT bands into a prompt-ready spectral balance string.
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
      b.db > bands[i - 1].db && b.db > bands[i + 1].db &&
      b.db > bands[i - 2].db && b.db > bands[i + 2].db &&
      b.db > -50
    ) peaks.push({ freq: b.freq, db: b.db })
  }
  peaks.sort((a, b) => b.db - a.db)
  const topPeaks = peaks.slice(0, 4)
    .map((p) => `${p.freq < 1000 ? p.freq + ' Hz' : (p.freq / 1000).toFixed(1) + ' kHz'} (${p.db} dB)`)
    .join(', ')

  const mudDelta   = (lowMid - mid).toFixed(1)
  const mudWarning   = lowMid > mid + 8
    ? ` WARNING: possible mud buildup in 250–800 Hz range (low-mids are ${mudDelta} dB louder than mids — relative buildup, not absolute level).`
    : ''
  const harshDelta = (hiMid - mid).toFixed(1)
  const harshWarning = hiMid > mid + 6
    ? ` WARNING: possible harshness in 2.5–6 kHz range (hi-mids are ${harshDelta} dB louder than mids).`
    : ''
  const subDelta   = (sub - bass).toFixed(1)
  const subWarning   = sub > bass + 6
    ? ` WARNING: sub may be overwhelming the bass (sub is ${subDelta} dB louder than bass region).`
    : ''

  return [
    `Spectral balance — sub: ${sub.toFixed(1)} dB | bass: ${bass.toFixed(1)} dB | low-mids: ${lowMid.toFixed(1)} dB | mids: ${mid.toFixed(1)} dB | hi-mids: ${hiMid.toFixed(1)} dB | air: ${air.toFixed(1)} dB`,
    `Spectral tilt: ${tiltDesc} (bass vs air delta: ${tilt.toFixed(1)} dB)`,
    topPeaks ? `Prominent peaks: ${topPeaks}` : '',
    mudWarning + harshWarning + subWarning,
  ].filter(Boolean).join('. ')
}

export async function measureLUFS(buffer: AudioBuffer): Promise<number | null> {
  try {
    const { sampleRate, length, numberOfChannels } = buffer
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate)

    const monoBuffer = offlineCtx.createBuffer(1, length, sampleRate)
    const monoData = monoBuffer.getChannelData(0)
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const chData = buffer.getChannelData(ch)
      for (let i = 0; i < length; i++) monoData[i] += chData[i] / numberOfChannels
    }

    const source = offlineCtx.createBufferSource()
    source.buffer = monoBuffer

    // ITU-R BS.1770-3 K-weighting: stage 1 high-shelf + stage 2 high-pass
    const shelf = offlineCtx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 1500
    shelf.gain.value = 4.0

    const hp = offlineCtx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 38
    hp.Q.value = 0.5

    source.connect(shelf)
    shelf.connect(hp)
    hp.connect(offlineCtx.destination)
    source.start(0)

    const rendered = await offlineCtx.startRendering()
    const data = rendered.getChannelData(0)
    let sumSquares = 0
    for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i]
    const meanSquare = sumSquares / data.length
    if (meanSquare <= 0) return null
    return parseFloat((-0.691 + 10 * Math.log10(meanSquare)).toFixed(1))
  } catch (err) {
    console.error('[measureLUFS] error:', err)
    return null
  }
}

export function extractStereo(buffer: AudioBuffer): StereoSummary | null {
  if (buffer.numberOfChannels < 2) return null

  const L = buffer.getChannelData(0)
  const R = buffer.getChannelData(1)
  const n = Math.min(L.length, R.length)

  let sumLR = 0, sumL2 = 0, sumR2 = 0, sumM2 = 0, sumS2 = 0
  for (let i = 0; i < n; i++) {
    sumLR += L[i] * R[i]
    sumL2 += L[i] * L[i]
    sumR2 += R[i] * R[i]
    const m = (L[i] + R[i]) * 0.5
    const s = (L[i] - R[i]) * 0.5
    sumM2 += m * m
    sumS2 += s * s
  }

  const correlation = sumL2 > 0 && sumR2 > 0
    ? Math.max(-1, Math.min(1, sumLR / Math.sqrt(sumL2 * sumR2)))
    : 1

  const rmsM = Math.sqrt(sumM2 / n)
  const rmsS = Math.sqrt(sumS2 / n)

  return {
    correlation: parseFloat(correlation.toFixed(3)),
    midDbfs: rmsM > 0 ? parseFloat((20 * Math.log10(rmsM)).toFixed(1)) : null,
    sideDbfs: rmsS > 0 ? parseFloat((20 * Math.log10(rmsS)).toFixed(1)) : null,
    widthPercent: Math.round((1 - Math.abs(correlation)) * 100),
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
