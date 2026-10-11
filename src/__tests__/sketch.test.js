import { describe, it, expect } from 'vitest'
import { edgeStrength, joinAreas, outlinePaths, smoothCurve, colouringSketch } from '../lib/sketch.js'

// Three areas side by side: 0 | 1 | 2, with a sharp change between 0 and 1 and none between 1 and 2.
const w = 60, h = 30
const regionMap = new Int32Array(w * h)
const lab = new Float32Array(w * h * 3)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    regionMap[y * w + x] = x < 20 ? 0 : x < 40 ? 1 : 2
    lab[(y * w + x) * 3] = x < 20 ? 0.2 : 0.8
  }
}

describe('joining areas', () => {
  it('keeps a border that is an edge in the picture and drops one that is not', () => {
    const { strength } = edgeStrength(lab, w, h)
    const shapes = joinAreas(regionMap, 3, strength, w, h, { threshold: 0.01, minArea: 0 })
    expect(shapes[10]).not.toBe(shapes[30])
    expect(shapes[30]).toBe(shapes[50])
  })

  it('joins an area too small to colour in with a neighbour', () => {
    const map = Int32Array.from(regionMap)
    map[15 * w + 5] = 3
    const { strength } = edgeStrength(lab, w, h)
    const shapes = joinAreas(map, 4, strength, w, h, { threshold: 0, minArea: 4 })
    expect(shapes[15 * w + 5]).toBe(shapes[10])
    expect(new Set(shapes).size).toBe(3)
  })
})

describe('outlines', () => {
  it('give every border once, from edge to edge of the picture', () => {
    const paths = outlinePaths(regionMap, w, h)
    expect(paths).toHaveLength(2)
    for (const path of paths) {
      expect(path.closed).toBe(false)
      expect(path.points).toHaveLength(4) // a straight line needs its two ends only
    }
    expect(paths.map((p) => p.points[0]).sort((a, b) => a - b)).toEqual([20, 40])
  })

  it('close around a shape that lies inside another', () => {
    const map = new Int32Array(w * h)
    for (let y = 8; y < 22; y++) for (let x = 20; x < 40; x++) map[y * w + x] = 1
    const paths = outlinePaths(map, w, h)
    expect(paths).toHaveLength(1)
    expect(paths[0].closed).toBe(true)
    expect(paths[0].points.length / 2).toBe(4) // the corners of the rectangle
  })

  it('share the line where three shapes meet', () => {
    const map = new Int32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map[y * w + x] = x < 30 ? 0 : y < 15 ? 1 : 2
    // Two pieces of the upright line and the level one, meeting in one point.
    expect(outlinePaths(map, w, h)).toHaveLength(3)
  })
})

describe('smooth curves', () => {
  it('pass through every point, closed or open', () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10]
    const open = smoothCurve(points, false)
    expect(open).toHaveLength(3)
    expect(open.map((piece) => piece.slice(4))).toEqual([[10, 0], [10, 10], [0, 10]])
    const closed = smoothCurve(points, true)
    expect(closed).toHaveLength(4)
    expect(closed[3].slice(4)).toEqual([0, 0])
  })
})

describe('the sketch of a picture', () => {
  it('outlines a shape and draws nothing into a soft gradient', () => {
    const W = 120, H = 90
    const rgba = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inside = (x - 40) ** 2 + (y - 45) ** 2 < 25 ** 2
        const v = inside ? 40 : 200 + Math.round((x / W) * 30)
        rgba.set([v, inside ? 60 : v, inside ? 120 : v, 255], (y * W + x) * 4)
      }
    }
    const sketch = colouringSketch(rgba, W, H)
    expect(sketch.paths.length).toBeGreaterThan(0)
    // Every line stays near the circle; none crosses the graded background on the right.
    for (const path of sketch.paths) {
      for (let i = 0; i < path.points.length; i += 2) expect(path.points[i]).toBeLessThan(75)
    }
    expect(sketch.paths.every((p) => p.firm)).toBe(true)
    const elsewhere = colouringSketch(rgba, W, H, { subjects: [[0.8, 0, 1, 1]] })
    expect(elsewhere.paths.some((p) => p.firm)).toBe(false)
  })
})
