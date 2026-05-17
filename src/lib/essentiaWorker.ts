// Essentia.js Web Worker
// Loaded via new Worker(new URL('./essentiaWorker.ts', import.meta.url))

import EssentiaWASM from 'essentia.js/dist/essentia-wasm.web.js'
import { Essentia } from 'essentia.js'

let essentia: InstanceType<typeof Essentia> | null = null

async function init() {
  const wasmModule = await EssentiaWASM()
  essentia = new Essentia(wasmModule)
}

self.onmessage = async (e: MessageEvent<{ channelData: Float32Array; sampleRate: number }>) => {
  if (!essentia) await init()
  const { channelData, sampleRate } = e.data
  try {
    const essentiaInput = essentia!.arrayToVector(channelData)

    // BPM
    const rhythm = essentia!.RhythmExtractor2013(essentiaInput)
    const bpm = Math.round(rhythm.bpm)

    // Key
    const keyResult = essentia!.KeyExtractor(essentiaInput, true, 4096, 4096, 12, 3500, 60, 25, 0.2, 'bgate', sampleRate, 0.0001, 440, 'cosine', 'hann')
    const key = `${keyResult.key} ${keyResult.scale}`

    self.postMessage({ bpm, key })
  } catch (err) {
    self.postMessage({ bpm: null, key: null, error: String(err) })
  }
}
