import { segmentImage } from '../lib/segment.js'
import { colouringSketch } from '../lib/sketch.js'
import { layerImage } from '../lib/layers.js'
import { blockImage } from '../lib/blocking.js'
import { postMix } from '../lib/mixClient.js'

self.onmessage = async (event) => {
  const { jobId, kind, rgba, width, height } = event.data
  try {
    if (kind === 'layers') {
      // Layer mode: the picture as glazes of a few base paints. The layers are planned on the
      // server (`planUrl`) from the colours of the picture; the picture stays here.
      const { paints, count, paintIds, maxCoats, simplify, accents, geometric, planUrl } = event.data
      const result = await layerImage(rgba, width, height, paints, { count, paintIds, maxCoats, simplify, accents, geometric }, (request) => postMix(planUrl, request))
      const buffers = [result.comboMap.buffer, ...result.layers.flatMap((l) => [l.coatMap.buffer, l.regionMap.buffer])]
      self.postMessage({ jobId, result }, buffers)
      return
    }
    if (kind === 'blocking') {
      // Blocking: light and shadow in large masses.
      const { tones, split, forms } = event.data
      const result = blockImage(rgba, width, height, { tones, split, forms })
      self.postMessage({ jobId, result }, [result.toneMap.buffer, result.regionMap.buffer])
      return
    }
    if (kind === 'sketch') {
      // The pencil sketch: closed shapes with smooth outlines, like a colouring book.
      self.postMessage({ jobId, result: colouringSketch(rgba, width, height, { subjects: event.data.subjects }) })
      return
    }
    const { colours, simplify, geometric, anchors, focus, maxWashes, washStep, variety } = event.data
    const result = segmentImage(rgba, width, height, { colours, simplify, geometric, anchors, focus, maxWashes, washStep, variety })
    self.postMessage({ jobId, result }, [result.regionMap.buffer])
  } catch (error) {
    self.postMessage({ jobId, error: String(error?.message || error), status: error?.status })
  }
}
