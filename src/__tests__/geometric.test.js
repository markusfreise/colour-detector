import { describe, it, expect } from 'vitest'
import { straighten, geometricAreas, edgeTolerance } from '../lib/geometric.js'
import { segmentImage } from '../lib/segment.js'

// A disc of label 1 on label 0, with a small square of label 2 inside it.
function disc(width, height) {
  const labels = new Int32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((x - 30) ** 2 + (y - 30) ** 2 <= 20 ** 2) labels[y * width + x] = 1
      if (x >= 27 && x <= 33 && y >= 27 && y <= 33) labels[y * width + x] = 2
    }
  }
  return labels
}

// Corners of the outline of a label: pixels where the border turns.
function corners(labels, width, height, label) {
  const is = (x, y) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === label
  let n = 0
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const k = is(x - 1, y - 1) + is(x, y - 1) + is(x - 1, y) + is(x, y)
      if (k === 1 || k === 3) n++
    }
  }
  return n
}

describe('straighten', () => {
  it('turns a disc into a polygon and keeps what lies inside it', () => {
    const w = 60, h = 60
    const labels = disc(w, h)
    const out = straighten(labels, w, h, 3)
    expect(out.length).toBe(labels.length)
    expect([...new Set(out)].sort()).toEqual([0, 1, 2])
    // The square inside is laid over the disc, not swallowed by it.
    expect(out[30 * w + 30]).toBe(2)
    expect(out[30 * w + 15]).toBe(1)
    expect(out[2 * w + 2]).toBe(0)
    // About the same area, with far fewer steps along its edge.
    const area = (map) => map.reduce((n, v) => n + (v === 1), 0)
    expect(Math.abs(area(out) - area(labels)) / area(labels)).toBeLessThan(0.15)
    const again = straighten(labels, w, h, 0.4)
    expect(area(again)).toBeGreaterThan(area(labels) * 0.9)
  })

  it('leaves thin shapes and single pixels as they are', () => {
    const w = 20, h = 10
    const labels = new Int32Array(w * h)
    for (let x = 2; x < 18; x++) labels[4 * w + x] = 1
    labels[8 * w + 3] = 2
    const out = straighten(labels, w, h, 3)
    expect(out[4 * w + 10]).toBe(1)
    expect(out[8 * w + 3]).toBe(2)
  })

  it('handles one label and one pixel', () => {
    expect([...straighten(new Int32Array(12).fill(3), 4, 3, 2)]).toEqual(new Array(12).fill(3))
    expect([...straighten(new Int32Array(1), 1, 1, 2)]).toEqual([0])
  })
})

describe('geometric areas', () => {
  it('tolerance grows with the picture and with simplify', () => {
    expect(edgeTolerance(800, 600, 0)).toBeGreaterThan(edgeTolerance(400, 300, 0))
    expect(edgeTolerance(800, 600, 6)).toBeGreaterThan(edgeTolerance(800, 600, 0))
  })

  it('gives a picture fewer and straighter areas', () => {
    const w = 120, h = 90
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const inside = (x - 60) ** 2 + (y - 45) ** 2 < 30 ** 2
        rgba[o] = inside ? 200 : 40; rgba[o + 1] = inside ? 60 : 90; rgba[o + 2] = inside ? 50 : 180; rgba[o + 3] = 255
      }
    }
    const organic = segmentImage(rgba, w, h, { colours: 2, simplify: 0 })
    const geometric = segmentImage(rgba, w, h, { colours: 2, simplify: 0, geometric: true })
    expect(geometric.regions.length).toBeLessThanOrEqual(organic.regions.length)
    const labelsOf = (seg) => Int32Array.from(seg.regionMap, (r) => seg.regions[r].cluster)
    const inner = (seg) => seg.regions[seg.regionMap[45 * w + 60]].cluster
    expect(corners(labelsOf(geometric), w, h, inner(geometric))).toBeLessThan(corners(labelsOf(organic), w, h, inner(organic)))
    expect(geometricAreas(labelsOf(organic), w, h, 0).length).toBe(w * h)
  })
})
