import { describe, it, expect } from 'vitest'
import { segmentImage, connectedComponents, toOklabPixels, mulberry32 } from '../lib/segment.js'
import { compactPatches, patchColours, labelColours, smoothOutlines, mergeSmallAreas } from '../lib/smooth.js'

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

// Two flat halves (and a small dark square in the left one) under heavy noise.
function noisyPicture(w, h, seed = 3) {
  const rand = mulberry32(seed)
  return makeImage(w, h, (x, y) => {
    const n = () => Math.round((rand() - 0.5) * 40)
    if (x >= 30 && x < 42 && y >= 40 && y < 52) return [40 + n(), 30 + n(), 30 + n()]
    return x < w / 2 ? [200 + n() * 0.7, 150 + n(), 110 + n()] : [90 + n(), 130 + n(), 180 + n() * 0.7]
  })
}

const smallest = (labels, w, h) => Math.min(...connectedComponents(labels, w, h).regionSize)

describe('smooth', () => {
  it('takes the noise out of a picture and leaves its edges', () => {
    const w = 120, h = 90
    const lab = toOklabPixels(noisyPicture(w, h), w * h)
    const calm = patchColours(lab, w, h, compactPatches(lab, w, h, 5))
    const spread = (pixels, x0, x1) => {
      let sum = 0, sq = 0, n = 0
      for (let y = 0; y < 30; y++) for (let x = x0; x < x1; x++) { const L = pixels[(y * w + x) * 3]; sum += L; sq += L * L; n++ }
      return Math.sqrt(sq / n - (sum / n) ** 2)
    }
    expect(spread(calm, 5, 50)).toBeLessThan(spread(lab, 5, 50) / 4)
    // The two halves are still two colours, right up to the edge between them.
    const L = (x) => calm[(20 * w + x) * 3]
    expect(Math.abs(L(56) - L(63))).toBeGreaterThan(0.1)
    expect(Math.abs(L(56) - L(20))).toBeLessThan(0.03)
  })

  it('rounds a jagged outline between two similar colours', () => {
    const w = 60, h = 60
    const labels = new Int32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = x < 30 + (y % 4 < 2 ? 2 : -2) ? 0 : 1
    const lab = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) lab[p * 3] = labels[p] ? 0.52 : 0.5
    const out = smoothOutlines(labels, lab, labelColours(labels, lab, 2), w, h, 2, { passes: 3 })
    const border = (l) => { let n = 0; for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; n += (l[p] !== l[p + 1]) + (l[p] !== l[p + w]) } return n }
    expect(border(out)).toBeLessThan(border(labels) / 2)
    expect(border(out)).toBeLessThan(h + 6)
  })

  it('keeps a thin shape in a clearly different colour when it rounds outlines', () => {
    const w = 40, h = 40
    const labels = new Int32Array(w * h)
    for (let y = 5; y < 35; y++) for (let x = 19; x < 21; x++) labels[y * w + x] = 1
    const lab = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) { lab[p * 3] = labels[p] ? 0.9 : 0.3; lab[p * 3 + 2] = labels[p] ? 0.15 : -0.1 }
    const out = smoothOutlines(labels, lab, labelColours(labels, lab, 2), w, h, 2, { passes: 3 })
    expect(Array.from(out)).toEqual(Array.from(labels))
  })

  it('always finishes joining small areas, even in pure noise', () => {
    const w = 120, h = 100
    const rand = mulberry32(11)
    const labels = Int32Array.from({ length: w * h }, () => Math.floor(rand() * 6))
    const lab = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) lab[p * 3] = 0.3 + labels[p] * 0.02
    const out = mergeSmallAreas(labels, lab, w, h, 40)
    expect(smallest(out, w, h)).toBeGreaterThanOrEqual(40)
    expect(new Set(out).size).toBeGreaterThan(1)
  })

  it('keeps a small area that stands out and joins one that does not', () => {
    const w = 60, h = 40
    const labels = new Int32Array(w * h)
    const lab = new Float32Array(w * h * 3).fill(0)
    for (let p = 0; p < w * h; p++) lab[p * 3] = 0.7
    const square = (x0, label, L) => { for (let y = 10; y < 15; y++) for (let x = x0; x < x0 + 5; x++) { labels[y * w + x] = label; lab[(y * w + x) * 3] = L } }
    square(10, 1, 0.2) // dark: an eye
    square(40, 2, 0.68) // nearly the colour around it
    const out = mergeSmallAreas(labels, lab, w, h, 60, { keepSize: 15, keepContrast: 0.15 })
    expect(out[12 * w + 12]).toBe(1)
    expect(out[12 * w + 42]).toBe(0)
  })

  it('gives a noisy picture a few calm areas at any Simplify and keeps what stands out', () => {
    const w = 120, h = 90
    const rgba = noisyPicture(w, h)
    for (const simplify of [0, 4, 8]) {
      const seg = segmentImage(rgba, w, h, { colours: 6, simplify })
      // The pixels are noise, the areas are not: far fewer areas than the noise has grains.
      expect(seg.regions.length).toBeLessThan(10)
      if (simplify > 0) expect(seg.regions.filter((r) => r.size < 6).length).toBe(0)
      if (simplify === 0) {
        // The dark square is an area of its own, about its size.
        const dark = seg.regions[seg.regionMap[46 * w + 36]]
        expect(dark.size).toBeGreaterThan(100)
        expect(dark.size).toBeLessThan(200)
      }
    }
  })

  it('gives the same areas every time, and finer ones inside a focus box', () => {
    const w = 120, h = 90
    const rgba = noisyPicture(w, h)
    const a = segmentImage(rgba, w, h, { colours: 6, simplify: 2 })
    const b = segmentImage(rgba, w, h, { colours: 6, simplify: 2 })
    expect(Array.from(a.regionMap)).toEqual(Array.from(b.regionMap))
    const focused = segmentImage(rgba, w, h, { colours: 6, simplify: 2, focus: [[0.1, 0.1, 0.4, 0.9]] })
    expect(focused.regions.length).toBeGreaterThanOrEqual(a.regions.length)
    // Outside the box nothing changes.
    const label = (seg, p) => seg.regions[seg.regionMap[p]].cluster
    for (let y = 0; y < h; y += 7) expect(label(focused, y * w + 100)).toBe(label(a, y * w + 100))
  })
})
