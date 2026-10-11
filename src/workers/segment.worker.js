import { segmentImage } from '../lib/segment.js'
import { layerImage } from '../lib/layers.js'

self.onmessage = (event) => {
  const { jobId, kind, rgba, width, height } = event.data
  try {
    if (kind === 'layers') {
      // Layer mode: the picture as glazes of a few base paints.
      const { paints, count, paintIds, maxCoats, simplify } = event.data
      const result = layerImage(rgba, width, height, paints, { count, paintIds, maxCoats, simplify })
      const buffers = [result.comboMap.buffer, ...result.layers.flatMap((l) => [l.coatMap.buffer, l.regionMap.buffer])]
      self.postMessage({ jobId, result }, buffers)
      return
    }
    const { colours, simplify } = event.data
    const result = segmentImage(rgba, width, height, { colours, simplify })
    self.postMessage({ jobId, result }, [result.regionMap.buffer])
  } catch (error) {
    self.postMessage({ jobId, error: String(error?.message || error) })
  }
}
