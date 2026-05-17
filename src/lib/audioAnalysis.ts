import type { EnergyPoint, Section } from '@/types/analysis'

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
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    )
    const source = offlineCtx.createBufferSource()
    source.buffer = buffer

    const bufferSize = 512
    const analyser = offlineCtx.createAnalyser()
    source.connect(analyser)
    analyser.connect(offlineCtx.destination)
    source.start()

    const channelData = buffer.getChannelData(0)
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

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
