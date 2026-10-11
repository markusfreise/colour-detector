import { segmentImage, toOklabPixels } from '../lib/segment.js'
import { boxMask, edgeSketch } from '../lib/details.js'
import { layerImage } from '../lib/layers.js'

self.onmessage = (event) => {
  const { jobId, kind, rgba, width, height } = event.data
  try {
    if (kind === 'layers') {
      // Layer mode: the picture as glazes of a few base paints.
      const { paints, count, paintIds, maxCoats, simplify, accents, geometric } = event.data
      const result = layerImage(rgba, width, height, paints, { count, paintIds, maxCoats, simplify, accents, geometric })
      const buffers = [result.comboMap.buffer, ...result.layers.flatMap((l) => [l.coatMap.buffer, l.regionMap.buffer])]
      self.postMessage({ jobId, result }, buffers)
      return
    }
    if (kind === 'sketch') {
      // The pencil sketch: the edges of the picture, firm inside the main subjects.
      const { subjects } = event.data
      const strong = subjects?.length ? boxMask(subjects, width, height, 0.05) : null
      const lines = edgeSketch(toOklabPixels(rgba, width * height), width, height, strong)
      self.postMessage({ jobId, result: { lines, width, height } }, [lines.buffer])
      return
    }
    const { colours, simplify, geometric, anchors, focus } = event.data
    const result = segmentImage(rgba, width, height, { colours, simplify, geometric, anchors, focus })
    self.postMessage({ jobId, result }, [result.regionMap.buffer])
  } catch (error) {
    self.postMessage({ jobId, error: String(error?.message || error) })
  }
}
