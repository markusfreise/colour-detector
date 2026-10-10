import { describe, it, expect } from 'vitest'
import { segmentImage, connectedComponents } from '../lib/segment.js'

function makeImage(width, height, fn) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 4
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
    }
  return rgba
}

describe('segment', () => {
  it('splits a two-colour image into two areas', () => {
    const rgba = makeImage(40, 20, (x) => (x < 20 ? [200, 40, 30] : [30, 60, 160]))
    const seg = segmentImage(rgba, 40, 20, { colours: 2, simplify: 0 })
    expect(seg.regions).toHaveLength(2)
    expect(seg.clusters.filter((c) => c.pixelCount).length).toBe(2)
  })
  it('merges speckle noise into the surrounding area', () => {
    const rgba = makeImage(60, 60, (x, y) => ((x * 7 + y * 13) % 97 === 0 ? [255, 255, 255] : [90, 120, 60]))
    const seg = segmentImage(rgba, 60, 60, { colours: 2, simplify: 4 })
    expect(seg.regions.length).toBe(1)
  })
  it('labels 4-connected components', () => {
    const labels = Int32Array.from([0, 0, 1, 1, 0, 1, 1, 1, 0])
    const { regionCluster } = connectedComponents(labels, 3, 3)
    expect(regionCluster).toEqual([0, 1, 1, 0])
    expect(regionCluster.length).toBe(4)
  })
})
