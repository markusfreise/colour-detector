import { segmentImage } from '../lib/segment.js'

self.onmessage = (event) => {
  const { jobId, rgba, width, height, colours, simplify } = event.data
  try {
    const result = segmentImage(rgba, width, height, { colours, simplify })
    self.postMessage({ jobId, result }, [result.regionMap.buffer])
  } catch (error) {
    self.postMessage({ jobId, error: String(error?.message || error) })
  }
}
