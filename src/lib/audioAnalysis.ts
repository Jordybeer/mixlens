import type { EnergyPoint, Section } from '@/types/analysis'

// Extract RMS energy curve from decoded AudioBuffer
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

// Naive section detection from energy curve
export function detectSections(energyCurve: EnergyPoint[], duration: number): Section[] {
  if (energyCurve.length < 4) {
    return [{ label: 'full track', startSeconds: 0, endSeconds: duration }]
  }

  const avg = energyCurve.reduce((s, p) => s + p.rms, 0) / energyCurve.length
  const sections: Section[] = []
  let sectionStart = 0
  let prevLabel = ''

  energyCurve.forEach((point, i) => {
    const ratio = point.rms / avg
    let label: string
    if (ratio < 0.3) label = 'breakdown'
    else if (ratio < 0.7) label = 'build'
    else label = 'drop'

    if (i === 0) label = 'intro'
    if (i === energyCurve.length - 1) label = 'outro'

    if (label !== prevLabel && prevLabel !== '') {
      sections.push({ label: prevLabel, startSeconds: sectionStart, endSeconds: point.time })
      sectionStart = point.time
    }
    prevLabel = label
  })

  sections.push({
    label: prevLabel,
    startSeconds: sectionStart,
    endSeconds: duration,
  })

  return sections
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
