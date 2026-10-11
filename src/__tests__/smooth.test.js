import { describe, it, expect } from 'vitest'
import { segmentImage, connectedComponents, toOklabPixels, mulberry32 } from '../lib/segment.js'
import { compactPatches, patchColours, findAreas, findDetails, mergeAreas, roundOutlines } from '../lib/smooth.js'

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

// A face, more or less: skin under noise with two eyes of 9 x 5 pixels, darker than the skin
// but not black, so that they go at a high Simplify.
const EYES = [[60, 60], [100, 60]]
function facePicture(w, h) {
  const rand = mulberry32(5)
  return makeImage(w, h, (x, y) => {
    const n = () => Math.round((rand() - 0.5) * 30)
    for (const [ex, ey] of EYES) if (Math.abs(x - ex) <= 4 && Math.abs(y - ey) <= 2) return [165 + n(), 110 + n(), 90 + n()]
    return [225 + n() * 0.5, 170 + n() + (x >> 3), 140 + n()]
  })
}

// A label map (0 = ground at lightness `ground`) with shapes drawn into it: [label, lightness, x0, y0, x1, y1].
function drawn(w, h, ground, shapes) {
  const labels = new Int32Array(w * h)
  const lab = new Float32Array(w * h * 3)
  for (let p = 0; p < w * h; p++) lab[p * 3] = ground
  for (const [label, L, x0, y0, x1, y1] of shapes) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { labels[y * w + x] = label; lab[(y * w + x) * 3] = L }
  }
  return { labels, lab }
}

const sizes = (labels, w, h) => Array.from(findAreas(labels, w, h).sizeOf)
const outline = (l, w, h) => { let n = 0; for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { const p = y * w + x; n += (l[p] !== l[p + 1]) + (l[p] !== l[p + w]) } return n }

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

  it('finds the same areas as connectedComponents', () => {
    const w = 37, h = 23
    const rand = mulberry32(2)
    const labels = Int32Array.from({ length: w * h }, () => Math.floor(rand() * 3))
    const a = findAreas(labels, w, h), b = connectedComponents(labels, w, h)
    expect(Array.from(a.areaOf)).toEqual(Array.from(b.regionMap))
    expect(Array.from(a.labelOf)).toEqual(b.regionCluster)
    expect(Array.from(a.sizeOf)).toEqual(b.regionSize)
    expect(a.count).toBe(b.regionSize.length)
  })

  it('rounds a jagged outline', () => {
    const w = 60, h = 60
    const labels = new Int32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = x < 30 + (y % 4 < 2 ? 2 : -2) ? 0 : 1
    const out = roundOutlines(labels, w, h, 2, { radius: 3, passes: 3 })
    expect(outline(out, w, h)).toBeLessThan(outline(labels, w, h) / 2)
    expect(outline(out, w, h)).toBeLessThan(h + 6)
  })

  it('takes a thin tongue off an area when it rounds, but never touches a detail', () => {
    const w = 40, h = 40
    const { labels } = drawn(w, h, 0.3, [[1, 0.9, 19, 5, 21, 35]])
    const gone = roundOutlines(labels, w, h, 2, { radius: 3, passes: 2 })
    expect(new Set(gone).size).toBe(1)
    const fixed = Uint8Array.from(labels)
    const kept = roundOutlines(labels, w, h, 2, { radius: 3, passes: 2, fixed })
    expect(Array.from(kept)).toEqual(Array.from(labels))
    // With a mask, nothing outside it changes.
    const only = new Uint8Array(w * h)
    for (let y = 0; y < 20; y++) only.fill(1, y * w, y * w + w)
    const half = roundOutlines(labels, w, h, 2, { radius: 3, passes: 2, only })
    expect(half[10 * w + 19]).toBe(0)
    expect(half[30 * w + 19]).toBe(1)
  })

  it('always finishes joining small areas, even in pure noise', () => {
    const w = 120, h = 100
    const rand = mulberry32(11)
    const labels = Int32Array.from({ length: w * h }, () => Math.floor(rand() * 6))
    const lab = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) lab[p * 3] = 0.3 + labels[p] * 0.1
    const out = mergeAreas(labels, lab, w, h, [{ minSize: 40 }])
    expect(Math.min(...sizes(out, w, h))).toBeGreaterThanOrEqual(40)
    // Only what is too small joins: the picture does not run into one area.
    expect(sizes(out, w, h).length).toBeGreaterThan(20)
  })

  it('joins large areas of nearly one colour and keeps those of different colours apart', () => {
    const w = 90, h = 40
    // Three stripes: two shades of one colour, and a much lighter one.
    const { labels, lab } = drawn(w, h, 0.4, [[1, 0.42, 30, 0, 60, h], [2, 0.8, 60, 0, 90, h]])
    const out = mergeAreas(labels, lab, w, h, [{ limit: 0.02 }])
    expect(out[5]).toBe(out[45])
    expect(out[75]).toBe(2)
    expect(sizes(out, w, h)).toEqual([60 * h, 30 * h])
    // On equal sizes the lower area gives its label.
    expect(out[45]).toBe(0)
  })

  it('finds the details: what is small and stands out from all that is around it', () => {
    const w = 100, h = 60
    const { labels, lab } = drawn(w, h, 0.7, [
      [1, 0.2, 10, 10, 16, 15], // dark on light: an eye
      [2, 0.68, 30, 10, 36, 15], // nearly the colour around it
      [3, 0.2, 60, 0, 100, h], // a large dark area ...
      [4, 0.45, 58, 0, 60, h], // ... and the strip between it and the light one
      [5, 0.25, 10, 40, 40, 41], // a wire: large, but thin
      [6, 0.2, 20, 22, 22, 24], // dark, but smaller than the smallest area
    ])
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40 })
    const at = (x, y) => details[y * w + x]
    // The eye: 30 pixels with 22 of outline, 0.5 from the colour around it.
    expect(at(12, 12)).toBeCloseTo((30 / 22) * 0.25, 2)
    expect(at(32, 12)).toBe(0)
    expect(at(80, 30)).toBe(0)
    expect(at(58, 30)).toBe(0)
    expect(at(25, 40)).toBeGreaterThan(0.04)
    expect(at(20, 22)).toBe(0)
    // All of an area or none of it.
    for (let p = 0; p < w * h; p++) if (labels[p] === 1) expect(details[p]).toBe(details[12 * w + 12])
  })

  it('keeps or drops the letters of a line together', () => {
    const w = 80, h = 30
    // Strokes of one colour close together; the last one is fainter than a detail on its own may be.
    const strokes = [[1, 0.1, 10, 10, 12, 20], [2, 0.1, 16, 10, 18, 20], [3, 0.1, 22, 10, 24, 20], [4, 0.2, 28, 10, 29, 20]]
    const { labels, lab } = drawn(w, h, 0.95, strokes)
    const worth = (map) => strokes.map(([, , x, y]) => +map[y * w + x].toFixed(2))
    // On its own a wide stroke is worth 20 / 24 x 0.85 ^ 2 = 0.6 and the narrow one 10 / 22 x 0.75 ^ 2 = 0.26.
    // Together all are worth the best of them, the faint one at most twice its own worth.
    expect(worth(findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40 }))).toEqual([0.6, 0.6, 0.6, 0.51])
    // Far from the others the faint stroke is judged on its own.
    const apart = drawn(w, h, 0.95, [...strokes.slice(0, 3), [4, 0.2, 60, 10, 61, 20]])
    const details = findDetails(apart.labels, apart.lab, w, h, { minSize: 6, maxSize: 40 })
    expect(details[10 * w + 10]).toBeCloseTo(0.6, 2)
    expect(details[10 * w + 60]).toBeCloseTo(0.26, 2)
  })

  it('leaves a detail and the hole inside it alone when areas join', () => {
    const w = 60, h = 40
    // A dark ring (a letter o) with a light middle, and a small light patch that is no detail.
    const { labels, lab } = drawn(w, h, 0.7, [[1, 0.1, 10, 10, 20, 20], [2, 0.72, 13, 13, 17, 17], [3, 0.72, 40, 10, 45, 15]])
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 200 })
    const out = mergeAreas(labels, lab, w, h, [{ minSize: 200, limit: 0.02, detailLimit: 0.04 }], { details })
    expect(out[11 * w + 11]).toBe(1)
    expect(out[15 * w + 15]).toBe(2)
    expect(out[12 * w + 42]).toBe(0)
    expect(sizes(out, w, h).sort((a, b) => a - b)).toEqual([16, 84, w * h - 100])
    // When the letter is not worth keeping, it goes whole, with its inside.
    const gone = mergeAreas(labels, lab, w, h, [{ minSize: 200, limit: 0.02, detailLimit: 5 }], { details })
    expect(sizes(gone, w, h)).toEqual([w * h])
  })

  it('joins in stages, each on what the one before left', () => {
    const w = 120, h = 100
    const rand = mulberry32(11)
    const labels = Int32Array.from({ length: w * h }, () => Math.floor(rand() * 6))
    const lab = new Float32Array(w * h * 3)
    for (let p = 0; p < w * h; p++) lab[p * 3] = 0.3 + labels[p] * 0.1
    const stages = [{ minSize: 10 }, { minSize: 30, limit: 0.01 }, { minSize: 80, limit: 0.05 }]
    let before = null
    for (let n = 1; n <= stages.length; n++) {
      const areas = findAreas(mergeAreas(labels, lab, w, h, stages.slice(0, n)), w, h)
      if (before) {
        // Every area of the stage before lies in one area of this stage.
        const holder = new Int32Array(before.count).fill(-1)
        for (let p = 0; p < w * h; p++) {
          if (holder[before.areaOf[p]] === -1) holder[before.areaOf[p]] = areas.areaOf[p]
          expect(areas.areaOf[p]).toBe(holder[before.areaOf[p]])
        }
        expect(areas.count).toBeLessThan(before.count)
      }
      before = areas
    }
  })

  it('gives a noisy picture a few calm areas at any Simplify and keeps what stands out', () => {
    const w = 120, h = 90
    const rgba = noisyPicture(w, h)
    for (const simplify of [0, 4, 8]) {
      const seg = segmentImage(rgba, w, h, { colours: 6, simplify })
      // The pixels are noise, the areas are not: far fewer areas than the noise has grains.
      expect(seg.regions.length).toBeLessThan(10)
      expect(seg.regions.filter((r) => r.size < 6).length).toBe(0)
      if (simplify === 0) {
        // The dark square is an area of its own, about its size.
        const dark = seg.regions[seg.regionMap[46 * w + 36]]
        expect(dark.size).toBeGreaterThan(100)
        expect(dark.size).toBeLessThan(200)
      }
    }
  })

  it('never keeps an area under six pixels, however small the picture', () => {
    const rand = mulberry32(9)
    for (const [w, h] of [[24, 18], [60, 40]]) {
      const rgba = makeImage(w, h, () => [rand() * 255, rand() * 255, rand() * 255])
      for (const simplify of [0, 3]) {
        const seg = segmentImage(rgba, w, h, { colours: 5, simplify })
        expect(Math.min(...seg.regions.map((r) => r.size))).toBeGreaterThanOrEqual(6)
        expect(seg.regions.reduce((sum, r) => sum + r.size, 0)).toBe(w * h)
      }
    }
  })

  it('keeps the eyes of a face whole at Simplify 4, and never half of one', () => {
    const w = 160, h = 120
    const rgba = facePicture(w, h)
    for (let simplify = 0; simplify <= 10; simplify++) {
      const seg = segmentImage(rgba, w, h, { colours: 6, simplify })
      const eyes = EYES.map(([x, y]) => seg.regions[seg.regionMap[y * w + x]])
      // 45 pixels each: an eye is there about whole, or it has gone into the skin around it.
      for (const eye of eyes) expect(eye.size > 1000 || (eye.size >= 36 && eye.size <= 60)).toBe(true)
      if (simplify <= 4) for (const eye of eyes) expect(eye.size).toBeLessThanOrEqual(60)
    }
  })

  it('never has more areas at a higher Simplify', () => {
    const w = 120, h = 90
    const rand = mulberry32(21)
    // Blobs of many colours under noise.
    const rgba = makeImage(w, h, (x, y) => {
      const n = () => Math.round((rand() - 0.5) * 50)
      const v = Math.sin(x / 9) + Math.cos(y / 7) + Math.sin((x + y) / 13)
      return [128 + 60 * v + n(), 128 - 50 * Math.sin(x / 11) + n(), 100 + 40 * Math.cos(y / 5) + n()]
    })
    for (const options of [{}, { focus: [[0.2, 0.2, 0.6, 0.7]] }]) {
      let before = Infinity
      for (let simplify = 0; simplify <= 10; simplify++) {
        const areas = segmentImage(rgba, w, h, { colours: 8, simplify, ...options }).regions.length
        expect(areas).toBeLessThanOrEqual(before)
        before = areas
      }
    }
  })

  it('gives the same areas every time', () => {
    const w = 120, h = 90
    const rgba = noisyPicture(w, h)
    for (const options of [{}, { focus: [[0.1, 0.1, 0.4, 0.9]] }, { geometric: true, focus: [[0.1, 0.1, 0.4, 0.9]] }, { anchors: ['#c89670', '#5a82b4', '#281e1e'] }]) {
      const a = segmentImage(rgba, w, h, { colours: 6, simplify: 2, ...options })
      const b = segmentImage(rgba, w, h, { colours: 6, simplify: 2, ...options })
      expect(Array.from(a.regionMap)).toEqual(Array.from(b.regionMap))
      expect(a.regions.reduce((sum, r) => sum + r.size, 0)).toBe(w * h)
      expect(Math.min(...a.regions.map((r) => r.size))).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps a focus box as fine as Simplify 0, and no more restless than that', () => {
    const w = 160, h = 120
    const rgba = facePicture(w, h)
    const box = [0.25, 0.3, 0.75, 0.7]
    const inBox = (seg) => {
      const ids = new Set()
      for (let y = Math.floor(box[1] * h); y < box[3] * h; y++) for (let x = Math.floor(box[0] * w); x < box[2] * w; x++) ids.add(seg.regionMap[y * w + x])
      return [...ids].map((id) => seg.regions[id].size)
    }
    const plain = segmentImage(rgba, w, h, { colours: 6, simplify: 0 })
    const fine = segmentImage(rgba, w, h, { colours: 6, simplify: 0, focus: [box] })
    const high = segmentImage(rgba, w, h, { colours: 6, simplify: 10 })
    const highFine = segmentImage(rgba, w, h, { colours: 6, simplify: 10, focus: [box] })
    // The eyes are gone at Simplify 10, and there again with the box.
    expect(high.regions[high.regionMap[60 * w + 60]].size).toBeGreaterThan(1000)
    for (const [x, y] of EYES) expect(highFine.regions[highFine.regionMap[y * w + x]].size).toBeLessThanOrEqual(60)
    // No specks from the box: nothing under six pixels, and hardly more small areas than without it.
    for (const seg of [fine, highFine]) {
      expect(Math.min(...inBox(seg))).toBeGreaterThanOrEqual(6)
      expect(inBox(seg).filter((s) => s < 40).length).toBeLessThanOrEqual(inBox(plain).filter((s) => s < 40).length + 2)
      expect(inBox(seg).length).toBeLessThanOrEqual(inBox(plain).length + 4)
    }
    // Outside the box nothing changes.
    const label = (seg, p) => seg.regions[seg.regionMap[p]].cluster
    for (let x = 0; x < w; x += 7) expect(label(highFine, 5 * w + x)).toBe(label(high, 5 * w + x))
  })
})
