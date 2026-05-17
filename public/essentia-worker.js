// Essentia.js Web Worker — loaded from public/ to avoid SSR bundling
// Uses importScripts so webpack never touches it

let essentia = null

async function init() {
  try {
    importScripts('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js')
    importScripts('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js')
    essentia = new EssentiaWASM()
  } catch (e) {
    self.postMessage({ bpm: null, key: null, error: 'essentia init failed: ' + e })
  }
}

self.onmessage = async function(e) {
  if (!essentia) await init()
  if (!essentia) {
    self.postMessage({ bpm: null, key: null })
    return
  }
  try {
    const { channelData, sampleRate } = e.data
    const vector = essentia.arrayToVector(channelData)
    const rhythm = essentia.RhythmExtractor2013(vector)
    const bpm = Math.round(rhythm.bpm)
    const keyResult = essentia.KeyExtractor(
      vector, true, 4096, 4096, 12, 3500, 60, 25, 0.2,
      'bgate', sampleRate, 0.0001, 440, 'cosine', 'hann'
    )
    const key = keyResult.key + ' ' + keyResult.scale
    self.postMessage({ bpm, key })
  } catch (err) {
    self.postMessage({ bpm: null, key: null, error: String(err) })
  }
}
