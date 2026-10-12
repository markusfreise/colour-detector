import { describe, it, expect } from 'vitest'
import { segmentImage, connectedComponents, toOklabPixels, mulberry32, FINEST } from '../lib/segment.js'
import { compactPatches, settlePatches, patchColours, findAreas, findDetails, mergeAreas, roundOutlines, outlineShifts, upscaleAreas, apart } from '../lib/smooth.js'

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
    const at = (x, y) => details.worth[y * w + x]
    // The eye: 30 pixels with 22 of outline, 0.5 from the colour around it.
    expect(at(12, 12)).toBeCloseTo((30 / 22) * 0.25, 2)
    expect(at(32, 12)).toBe(0)
    expect(at(80, 30)).toBe(0)
    expect(at(58, 30)).toBe(0)
    expect(at(25, 40)).toBeGreaterThan(0.04)
    expect(at(20, 22)).toBe(0)
    // All of an area or none of it.
    for (let p = 0; p < w * h; p++) if (labels[p] === 1) expect(details.worth[p]).toBe(details.worth[12 * w + 12])
    // On its own a detail counts as large as it is; what is none counts as nothing.
    expect(details.span[12 * w + 12]).toBe(30)
    expect(details.span[12 * w + 32]).toBe(0)
  })

  it('keeps or drops the letters of a line together', () => {
    const w = 80, h = 30
    // Strokes of one colour close together; the last one is fainter than a detail on its own may be.
    const strokes = [[1, 0.1, 10, 10, 12, 20], [2, 0.1, 16, 10, 18, 20], [3, 0.1, 22, 10, 24, 20], [4, 0.2, 28, 10, 29, 20]]
    const { labels, lab } = drawn(w, h, 0.95, strokes)
    const worth = (map) => strokes.map(([, , x, y]) => +map[y * w + x].toFixed(2))
    // On its own a wide stroke is worth 20 / 24 x 0.85 ^ 2 = 0.6 and the narrow one 10 / 22 x 0.75 ^ 2 = 0.26.
    // Together all are worth the best of them, the faint one at most twice its own worth.
    const together = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40 })
    expect(worth(together.worth)).toEqual([0.6, 0.6, 0.6, 0.51])
    // And all count as large as the largest of them (20 pixels), the narrow one of 10 too.
    expect(strokes.map(([, , x, y]) => together.span[y * w + x])).toEqual([20, 20, 20, 20])
    // Far from the others the faint stroke is judged on its own.
    const lone = drawn(w, h, 0.95, [...strokes.slice(0, 3), [4, 0.2, 60, 10, 61, 20]])
    const details = findDetails(lone.labels, lone.lab, w, h, { minSize: 6, maxSize: 40 })
    expect(details.worth[10 * w + 10]).toBeCloseTo(0.6, 2)
    expect(details.worth[10 * w + 60]).toBeCloseTo(0.26, 2)
    expect(details.span[10 * w + 60]).toBe(10)
  })

  it('keeps a detail as it was found: it takes nothing in and joins nothing', () => {
    const w = 60, h = 40
    // An eye on skin, with a scrap right beside it that is closer to the colour of the eye than
    // to the skin, and a second scrap of nearly the colour of the skin.
    const { labels, lab } = drawn(w, h, 0.7, [[1, 0.2, 10, 10, 18, 15], [2, 0.35, 18, 11, 20, 14], [3, 0.69, 30, 10, 33, 13]])
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 60 })
    expect(details.worth[12 * w + 12]).toBeGreaterThan(0.04)
    expect(details.worth[12 * w + 18]).toBeLessThan(0.04)
    const out = mergeAreas(labels, lab, w, h, [{ floor: 6, minSize: 60, limit: 0.02, detailLimit: 0.04 }], { details })
    // The scraps go into the skin, although the eye would be the cheaper neighbour of the first.
    expect(out[12 * w + 18]).toBe(0)
    expect(out[11 * w + 31]).toBe(0)
    const eye = findAreas(out, w, h)
    expect(eye.sizeOf[eye.areaOf[12 * w + 12]]).toBe(40)
    // Without the eye being a detail it is too small to stay.
    const gone = mergeAreas(labels, lab, w, h, [{ floor: 6, minSize: 60, limit: 0.02 }])
    expect(sizes(gone, w, h)).toEqual([w * h])
  })

  it('drops a detail that is too small or too large for the step, and anything under the floor', () => {
    const w = 60, h = 40
    // Details of 20, 4 and 64 pixels.
    const { labels, lab } = drawn(w, h, 0.7, [[1, 0.2, 10, 10, 15, 14], [2, 0.2, 40, 10, 42, 12], [3, 0.2, 30, 25, 38, 33]])
    const details = findDetails(labels, lab, w, h, { minSize: 1, maxSize: 100 })
    // The room a detail takes is its size; a thin or very small one takes none.
    expect(details.room[28 * w + 34]).toBe(64)
    expect(details.room[12 * w + 12]).toBe(0)
    const stage = { minSize: 100, limit: 0.02, detailLimit: 0.04 }
    const left = (rule) => sizes(mergeAreas(labels, lab, w, h, [{ ...stage, ...rule }], { details }), w, h).sort((a, b) => a - b)
    // All three stay when nothing more is asked of them.
    expect(left({}).slice(0, 3)).toEqual([4, 20, 64])
    // The floor takes the one of 4 pixels, a least size of 30 the one of 20 as well.
    expect(left({ floor: 6 }).slice(0, 2)).toEqual([20, 64])
    expect(left({ floor: 6, detailSize: 30 })).toEqual([64, w * h - 64])
    // A step with room for 50 pixels has none for the one of 64, which is then too small to stay.
    expect(left({ floor: 6, detailRoom: 50 })).toEqual([20, w * h - 20])
    expect(left({ floor: 6, detailRoom: 64 }).slice(0, 2)).toEqual([20, 64])
  })

  it('works out every round anew: an area that took one in waits for the next', () => {
    const w = 40, h = 10
    // Four stripes side by side, each 0.05 lighter than the one before: every pair is cheap enough
    // to join, the whole run is not. In one round the outer pairs join; the two halves that are
    // left are 0.1 apart and stay two areas.
    const { labels, lab } = drawn(w, h, 0.4, [[1, 0.45, 10, 0, 20, h], [2, 0.5, 20, 0, 30, h], [3, 0.55, 30, 0, 40, h]])
    const out = mergeAreas(labels, lab, w, h, [{ limit: 0.05 }])
    expect(sizes(out, w, h)).toEqual([20 * h, 20 * h])
    expect(out[5]).toBe(out[15])
    expect(out[25]).toBe(out[35])
    expect(out[15]).not.toBe(out[25])
  })

  it('counts two dark colours as closer than two light ones', () => {
    const light = apart(0.6, 0, 0, 0.7, 0, 0), dark = apart(0.1, 0, 0, 0.2, 0, 0)
    expect(light).toBeCloseTo(0.01, 6)
    expect(dark).toBeLessThan(light / 2)
    // A dark thing on a light ground counts in full.
    expect(apart(0.1, 0, 0, 0.6, 0, 0)).toBeCloseTo(0.25, 6)
    expect(apart(0.2, 0.01, 0, 0.1, 0, 0)).toBe(apart(0.1, 0, 0, 0.2, 0.01, 0))
  })

  it('takes noise from pixel to pixel for one colour, but not fine lines', () => {
    const w = 100, h = 60
    const rand = mulberry32(4)
    // Left: every pixel its own colour. Right: black lines one pixel wide on white.
    const rgba = makeImage(w, h, (x, y) => x < 50 ? [rand() * 255, rand() * 255, rand() * 255] : (y % 6 === 0 || x % 9 === 0 ? [0, 0, 0] : [255, 255, 255]))
    const lab = toOklabPixels(rgba, w * h)
    const patches = compactPatches(lab, w, h, 5)
    const restless = settlePatches(lab, w, h, patches)
    const at = (x, y) => restless[Math.floor(y / 5) * patches.cols + Math.floor(x / 5)]
    expect(at(20, 30)).toBe(1)
    expect(at(80, 30)).toBe(0)
    // In the noise every pixel is back in the square of the grid it lies in.
    expect(patches.patchOf[30 * w + 20]).toBe(6 * patches.cols + 4)
    const calm = patchColours(lab, w, h, patches, { restless })
    const L = (x, y) => calm[(y * w + x) * 3]
    for (const [x, y] of [[10, 10], [30, 40], [20, 25]]) expect(Math.abs(L(x, y) - L(22, 30))).toBeLessThan(0.05)
    // The lines are still black on white.
    expect(L(81, 20)).toBeLessThan(0.3)
    expect(L(84, 21)).toBeGreaterThan(0.9)
    // A picture without such noise is left alone.
    const flat = toOklabPixels(noisyPicture(w, h), w * h)
    expect(settlePatches(flat, w, h, compactPatches(flat, w, h, 5))).toBe(null)
  })

  it('makes one calm area of noise in all colours, and fewer areas of specks with every step', () => {
    const w = 160, h = 120
    const rand = mulberry32(8)
    const noise = makeImage(w, h, () => [rand() * 255, rand() * 255, rand() * 255])
    for (const simplify of [0, 4, 10]) expect(segmentImage(noise, w, h, { colours: 8, simplify }).regions.length).toBeLessThan(6)
    // Pixels in two greys are a picture of specks: Simplify takes them away.
    const specks = makeImage(w, h, () => (rand() < 0.5 ? [90, 90, 90] : [190, 190, 190]))
    const counts = [0, 4, 8, 10].map((simplify) => segmentImage(specks, w, h, { colours: 8, simplify }).regions.length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
    expect(counts[0]).toBeGreaterThan(50)
    expect(counts[3]).toBeLessThan(counts[0] / 8)
  })

  // A rough field: grains of 3 x 3 pixels every `pitch` pixels, each with a label of its own kind
  // (`kinds` of them in turn), and a photo that is noisier than the picture without noise.
  function grainField(w, h, pitch, kinds, extra = []) {
    const shapes = []
    let i = 0
    for (let y = 4; y + 3 < h; y += pitch) for (let x = 4; x + 3 < w; x += pitch) shapes.push([1 + (i++ % kinds), 0.4, x, y, x + 3, y + 3])
    const { labels, lab } = drawn(w, h, 0.7, [...shapes, ...extra])
    const rand = mulberry32(4)
    const photo = Float32Array.from(lab, (v, j) => (j % 3 === 0 ? v + (rand() - 0.5) * 0.12 : v))
    return { labels, lab, photo }
  }

  it('tells texture from details: grains of a rough zone are none, a thing on its own is', () => {
    const w = 120, h = 90
    // Grains all over the left half, and one dark piece of their size alone on the right.
    const { labels, lab, photo } = grainField(60, h, 8, 2)
    const wide = drawn(w, h, 0.7, [[9, 0.4, 90, 40, 93, 43]])
    for (let y = 0; y < h; y++) for (let x = 0; x < 60; x++) { wide.labels[y * w + x] = labels[y * 60 + x]; wide.lab[(y * w + x) * 3] = lab[(y * 60 + x) * 3] }
    const rand = mulberry32(4)
    const noisy = Float32Array.from(wide.lab, (v, j) => (j % 3 === 0 ? v + (rand() - 0.5) * 0.12 : v))
    const textured = new Uint8Array(w * h)
    const plain = findDetails(wide.labels, wide.lab, w, h, { minSize: 6, maxSize: 40 })
    const details = findDetails(wide.labels, wide.lab, w, h, { minSize: 6, maxSize: 40, photo: noisy, cell: 16, textured })
    // Without the photo every grain is a detail; with it none is, and the lone piece still is.
    expect(plain.worth[5 * w + 5]).toBeGreaterThan(0)
    expect(details.worth[5 * w + 5]).toBe(0)
    expect(details.worth[45 * w + 29]).toBe(0)
    expect(details.worth[41 * w + 91]).toBeGreaterThan(0)
    // The zone of texture is where the grains are.
    expect(textured[40 * w + 30]).toBe(1)
    expect(textured[40 * w + 100]).toBe(0)
  })

  it('never takes for texture a long line, a piece as large as an area that stays, or one on calm ground', () => {
    const w = 120, h = 90
    // A wire right across the grains and a window among them.
    const field = grainField(w, h, 8, 2, [[7, 0.2, 0, 44, w, 45], [8, 0.2, 60, 60, 70, 72]])
    const details = findDetails(field.labels, field.lab, w, h, { minSize: 6, maxSize: 200, photo: field.photo, cell: 16, pieceSize: 72 })
    expect(details.worth[5 * w + 5]).toBe(0)
    expect(details.worth[44 * w + 50]).toBeGreaterThan(0)
    expect(details.worth[65 * w + 65]).toBeGreaterThan(0)
    // The same grains on a ground the photo shows as calm as the picture: letters, not texture.
    const calm = findDetails(field.labels, field.lab, w, h, { minSize: 6, maxSize: 200, photo: field.lab, cell: 16, pieceSize: 72 })
    expect(calm.worth[5 * w + 5]).toBeGreaterThan(0)
  })

  it('judges texture the same whatever the size of the picture, when the cells scale with it', () => {
    const verdict = (scale) => {
      const w = 96 * scale, h = 64 * scale
      const shapes = []
      // Grains on the left half, two pieces of their size on their own on the right.
      for (let y = 4; y + 3 < 64; y += 8) for (let x = 4; x + 3 < 48; x += 8) shapes.push([1 + ((x + y) >> 3) % 2, 0.4, x * scale, y * scale, (x + 3) * scale, (y + 3) * scale])
      shapes.push([5, 0.4, 70 * scale, 20 * scale, 73 * scale, 23 * scale], [6, 0.4, 80 * scale, 44 * scale, 83 * scale, 47 * scale])
      const { labels, lab } = drawn(w, h, 0.7, shapes)
      const rand = mulberry32(4)
      const photo = Float32Array.from(lab, (v, j) => (j % 3 === 0 ? v + (rand() - 0.5) * 0.12 : v))
      const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40 * scale * scale, photo, cell: 16 * scale })
      const kept = (x, y) => details.worth[(y * scale + 1) * w + x * scale + 1] > 0
      return [kept(4, 4), kept(20, 28), kept(44, 60), kept(70, 20), kept(80, 44)]
    }
    expect(verdict(1)).toEqual([false, false, false, true, true])
    expect(verdict(2)).toEqual(verdict(1))
    expect(verdict(3)).toEqual(verdict(1))
  })

  it('keeps the parts of a small face: many pieces of many colours that stand out', () => {
    const w = 120, h = 90
    // Twelve strong pieces close together, each of a kind of its own; and twelve of one kind.
    const many = [], same = []
    for (let i = 0; i < 12; i++) {
      const x = 10 + (i % 4) * 7, y = 10 + Math.floor(i / 4) * 7
      many.push([1 + i, 0.2, x, y, x + 3, y + 3])
      same.push([20, 0.2, x + 60, y + 40, x + 63, y + 43])
    }
    const { labels, lab } = drawn(w, h, 0.7, [...many, ...same])
    const rand = mulberry32(4)
    const photo = Float32Array.from(lab, (v, j) => (j % 3 === 0 ? v + (rand() - 0.5) * 0.12 : v))
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40, photo, cell: 16 })
    expect(details.worth[18 * w + 18]).toBeGreaterThan(0)
    expect(details.worth[58 * w + 78]).toBe(0)
  })

  it('counts would-be details that touch as one thing', () => {
    const w = 60, h = 40
    // A dark mark of 12 pixels with a rim of 8 in another dark colour, and a mark of 12 alone.
    const { labels, lab } = drawn(w, h, 0.9, [[1, 0.2, 10, 10, 14, 13], [2, 0.3, 14, 10, 16, 14], [3, 0.2, 40, 10, 44, 13]])
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 40 })
    expect(details.span[11 * w + 11]).toBe(20)
    expect(details.span[11 * w + 15]).toBe(20)
    expect(details.span[11 * w + 41]).toBe(12)
  })

  it('joins areas in a zone of texture up to a larger size, but only what does not stand out', () => {
    const w = 60, h = 40
    // Two areas of 100 pixels on a ground of 0.5: one nearly its colour, one far from it.
    const { labels, lab } = drawn(w, h, 0.5, [[1, 0.56, 5, 5, 15, 15], [2, 0.2, 35, 5, 45, 15]])
    const stage = [{ minSize: 50, roughSize: 200, limit: 0 }]
    // Outside a zone of texture both are large enough.
    expect(sizes(mergeAreas(labels, lab, w, h, stage), w, h).sort((a, b) => a - b)).toEqual([100, 100, w * h - 200])
    // Inside one the near colour runs into the ground, the far one stays (a window in a house front).
    const rough = new Uint8Array(w * h).fill(1)
    expect(sizes(mergeAreas(labels, lab, w, h, stage, { rough }), w, h).sort((a, b) => a - b)).toEqual([100, w * h - 100])
  })

  it('leaves a detail and the hole inside it alone when areas join', () => {
    const w = 60, h = 40
    // A dark ring (a letter o) with a light middle, and a small light patch that is no detail.
    const { labels, lab } = drawn(w, h, 0.7, [[1, 0.1, 10, 10, 20, 20], [2, 0.72, 13, 13, 17, 17], [3, 0.72, 40, 10, 45, 15]])
    const details = findDetails(labels, lab, w, h, { minSize: 6, maxSize: 200 })
    const out = mergeAreas(labels, lab, w, h, [{ minSize: 200, limit: 0.02, detailLimit: 0.04 }], { details })
    expect(out[11 * w + 11]).toBe(1)
    expect(out[12 * w + 42]).toBe(0)
    expect(sizes(out, w, h).sort((a, b) => a - b)).toEqual([16, 84, w * h - 100])
    // The middle is nearly the colour of the ground around the letter: it is that ground, seen
    // through the letter, and is painted with it.
    expect(out[15 * w + 15]).toBe(0)
    // A middle of another colour (the white of an eye) keeps its own.
    const eye = drawn(w, h, 0.7, [[1, 0.1, 10, 10, 20, 20], [2, 0.95, 13, 13, 17, 17]])
    const white = mergeAreas(eye.labels, eye.lab, w, h, [{ minSize: 200, limit: 0.02, detailLimit: 0.04 }], { details: findDetails(eye.labels, eye.lab, w, h, { minSize: 6, maxSize: 200 }) })
    expect(white[15 * w + 15]).toBe(2)
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

  it('gets finer with every step below Simplify 0, down to areas that follow the photo', () => {
    // Texture: blotches of three pixels in many shades of green, which Simplify 0 runs together.
    const w = 160, h = 120, size = 3
    const rand = mulberry32(11)
    const cols = Math.ceil(w / size)
    const blotch = Array.from({ length: cols * Math.ceil(h / size) }, () => { const t = rand(); return [50 + 70 * t, 80 + 80 * t, 40 + 30 * rand()] })
    const rgba = makeImage(w, h, (x, y) => blotch[Math.floor(y / size) * cols + Math.floor(x / size)])
    const counts = []
    for (let simplify = 0; simplify >= FINEST; simplify--) counts.push(segmentImage(rgba, w, h, { colours: 6, simplify }).regions.length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1])
    expect(counts.at(-1)).toBeGreaterThan(counts[0] * 8)
    // Even at the lowest step no area is smaller than a touch of the brush.
    const finest = segmentImage(rgba, w, h, { colours: 6, simplify: FINEST })
    expect(finest.regions.filter((r) => r.size < 6).length).toBe(0)
    // Geometric areas take a step below 0 as 0.
    expect(() => segmentImage(rgba, w, h, { colours: 6, simplify: FINEST, geometric: true })).not.toThrow()
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
  describe('smooth drawing', () => {
    // A map of two labels, 1 where `inside` says so.
    const shape = (w, h, inside) => Int32Array.from({ length: w * h }, (_, p) => (inside(p % w, Math.floor(p / w)) ? 1 : 0))
    // The longest level piece of outline in the columns `from` to `to` of a map, in pixels.
    const longestStep = (l, w, h, from = 1, to = w - 1) => {
      let most = 0
      for (let y = 0; y < h - 1; y++) {
        let run = 0
        for (let x = from; x < to; x++) {
          // A level side that goes on from the one before, with no upright side between them.
          const level = l[y * w + x] !== l[(y + 1) * w + x]
          const straight = level && l[y * w + x - 1] === l[y * w + x] && l[(y + 1) * w + x - 1] === l[(y + 1) * w + x]
          run = level ? (straight ? run + 1 : 1) : 0
          if (run > most) most = run
        }
      }
      return most
    }

    it('draws a staircase as the slanted line it stands for', () => {
      const w = 80, h = 40
      // A line that falls one pixel in eight: steps of 8 pixels, 16 when enlarged pixel by pixel.
      const labels = shape(w, h, (x, y) => y >= 10 + Math.floor(x / 8))
      const big = upscaleAreas(labels, w, h, 2)
      expect(big.length).toBe(w * 2 * h * 2)
      // Twice as many steps of half the height: 8 enlarged pixels each, away from the ends.
      expect(longestStep(big, w * 2, h * 2, 24, w * 2 - 24)).toBeLessThanOrEqual(9)
      // As many pixels on each side as before, give or take a few at the ends.
      const ones = Array.from(big).filter((l) => l === 1).length
      expect(Math.abs(ones - 4 * Array.from(labels).filter((l) => l === 1).length)).toBeLessThan(24)
    })

    it('gives every enlarged pixel the label of its pixel or of a pixel beside that', () => {
      const w = 50, h = 40
      const rand = mulberry32(8)
      // Blobs of five labels with ragged outlines.
      const labels = Int32Array.from({ length: w * h }, (_, p) => Math.floor((Math.sin((p % w) / 5) + Math.cos(Math.floor(p / w) / 4) + 2 + rand() * 0.6) * 1.2) % 5)
      const big = upscaleAreas(labels, w, h, 2)
      for (let y = 0; y < h * 2; y++) {
        for (let x = 0; x < w * 2; x++) {
          const sx = x >> 1, sy = y >> 1, l = big[y * w * 2 + x]
          const near = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => sx + dx >= 0 && sx + dx < w && sy + dy >= 0 && sy + dy < h && labels[(sy + dy) * w + sx + dx] === l)
          expect(near).toBe(true)
        }
      }
      // Every pixel is still there with at least one of its four.
      for (let p = 0; p < w * h; p++) {
        const o = Math.floor(p / w) * 2 * w * 2 + (p % w) * 2
        expect([big[o], big[o + 1], big[o + w * 2], big[o + w * 2 + 1]]).toContain(labels[p])
      }
      expect(Array.from(upscaleAreas(labels, w, h, 2))).toEqual(Array.from(big))
    })

    it('keeps boxes, thin lines and dots exactly, and the corners of a large box', () => {
      const w = 60, h = 40
      const labels = shape(w, h, (x, y) => (x >= 5 && x < 25 && y >= 5 && y < 20) || (y === 30 && x >= 5 && x < 40) || (x === 50 && y >= 5 && y < 30) || (x === 45 && y === 35) || (x >= 30 && x < 32 && y >= 5 && y < 7))
      const big = upscaleAreas(labels, w, h, 2)
      for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) expect(big[y * w * 2 + x]).toBe(labels[(y >> 1) * w + (x >> 1)])
      const { dx, dy } = outlineShifts(labels, w, h)
      expect(dx.every((v) => v === 0) && dy.every((v) => v === 0)).toBe(true)
    })

    it('moves no outline by more than half a pixel and no point where three areas meet', () => {
      const w = 40, h = 40
      const labels = Int32Array.from({ length: w * h }, (_, p) => { const x = p % w, y = Math.floor(p / w); return y < 12 + Math.floor(x / 3) ? (x < 20 + Math.floor(y / 4) ? 0 : 1) : 2 })
      const { dx, dy } = outlineShifts(labels, w, h)
      let moved = 0
      for (let c = 0; c < dx.length; c++) {
        expect(Math.abs(dx[c])).toBeLessThanOrEqual(0.5)
        expect(Math.abs(dy[c])).toBeLessThanOrEqual(0.5)
        if (dx[c] || dy[c]) moved++
        const x = c % (w + 1), y = Math.floor(c / (w + 1))
        if (x === 0 || y === 0 || x === w || y === h) continue
        const around = new Set([labels[(y - 1) * w + x - 1], labels[(y - 1) * w + x], labels[y * w + x - 1], labels[y * w + x]])
        if (around.size > 2) expect(dx[c] === 0 && dy[c] === 0).toBe(true)
      }
      expect(moved).toBeGreaterThan(20)
    })

    it('draws a staircase of one up and one along in half steps, whichever way it runs', () => {
      const w = 40, h = 40
      for (const inside of [(x, y) => x > y, (x, y) => x + y > 39, (x, y) => x < y, (x, y) => x + y < 39]) {
        const labels = shape(w, h, inside)
        const big = upscaleAreas(labels, w, h, 2)
        // Enlarged pixel by pixel every step is 2 long; drawn smooth none is longer than 1.
        expect(longestStep(big, w * 2, h * 2, 8, w * 2 - 8)).toBe(1)
        const ones = Array.from(big).filter((l) => l === 1).length
        expect(Math.abs(ones - 4 * Array.from(labels).filter((l) => l === 1).length)).toBeLessThanOrEqual(2 * w)
      }
    })

    it('loses nothing in dense patterns or at the edge of the picture', () => {
      const w = 48, h = 36
      const rand = mulberry32(21)
      const maps = [
        shape(w, h, (x, y) => (x + y) % 2 === 0), // single pixels
        shape(w, h, (x, y) => ((x >> 1) + (y >> 1)) % 2 === 0), // squares of 2
        shape(w, h, (x, y) => ((x >> 2) + (y >> 2)) % 2 === 0), // squares of 4
        shape(w, h, (x) => x % 2 === 0), // lines of one pixel
        shape(w, h, (x, y) => ((x + y) >> 1) % 2 === 0), // slanted stripes
        Int32Array.from({ length: w * h }, () => Math.floor(rand() * 4)), // noise in four labels
        shape(w, h, (x, y) => x + y < 6 || x === w - 1 || y === 0), // shapes at the edge
      ]
      for (const labels of maps) {
        for (const scale of [2, 3]) {
          const W = w * scale
          const big = upscaleAreas(labels, w, h, scale)
          const counts = [0, 0, 0, 0], drawnAs = [0, 0, 0, 0]
          for (let p = 0; p < w * h; p++) {
            counts[labels[p]] += scale * scale
            const x = p % w, y = Math.floor(p / w)
            let own = 0
            for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
              const l = big[(y * scale + j) * W + x * scale + i]
              drawnAs[l]++
              if (l === labels[p]) own++
              // The label of the pixel or of one beside it, never from further away.
              const near = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && labels[(y + dy) * w + x + dx] === l)
              expect(near).toBe(true)
            }
            // Every pixel keeps at least one of its enlarged pixels.
            expect(own).toBeGreaterThan(0)
          }
          // No label gains or loses more than a twentieth of its pixels by the drawing.
          for (let l = 0; l < 4; l++) if (counts[l]) expect(Math.abs(drawnAs[l] - counts[l])).toBeLessThanOrEqual(counts[l] * 0.05)
        }
      }
    })

    it('enlarges by any whole number, and by one not at all', () => {
      const w = 30, h = 20
      const labels = shape(w, h, (x, y) => y >= 4 + Math.floor(x / 3))
      expect(Array.from(upscaleAreas(labels, w, h, 1))).toEqual(Array.from(labels))
      const big = upscaleAreas(labels, w, h, 3)
      expect(big.length).toBe(w * 3 * h * 3)
      expect(longestStep(big, w * 3, h * 3)).toBeLessThan(9)
    })
  })
})
