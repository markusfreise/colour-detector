// The pencil sketch to start a painting from, drawn like a colouring book: closed shapes with
// smooth outlines. The shapes are the calm colour areas of the picture, joined wherever the
// border between two of them is no real edge in the photo (mist, a soft gradient), so that a
// line is only drawn where the picture has one.

import { segmentImage, toOklabPixels, majorityFilter, connectedComponents } from './segment.js'
import { boxMask } from './details.js'

// Blur of one channel with a square of the given radius (twice, which comes close to a soft blur).
function soften(values, width, height, radius) {
  let src = values
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(src.length), dst = new Float32Array(src.length)
    for (let y = 0; y < height; y++) {
      let sum = 0, n = 0
      for (let x = -radius; x < width; x++) {
        if (x + radius < width) { sum += src[y * width + x + radius]; n++ }
        if (x - radius - 1 >= 0) { sum -= src[y * width + x - radius - 1]; n-- }
        if (x >= 0) tmp[y * width + x] = sum / n
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0, n = 0
      for (let y = -radius; y < height; y++) {
        if (y + radius < height) { sum += tmp[(y + radius) * width + x]; n++ }
        if (y - radius - 1 >= 0) { sum -= tmp[(y - radius - 1) * width + x]; n-- }
        if (y >= 0) dst[y * width + x] = sum / n
      }
    }
    src = dst
  }
  return src
}

// An edge counts from this change of colour per pixel on (OKLab).
const EDGE = 0.022
// A border between two areas with less change than this across it is no line to draw.
const WEAK_BORDER = 0.009
// Colour differences count for more than lightness: a shape often differs from its surroundings in hue only.
const CHROMA_WEIGHT = 1.6

/**
 * How sharply the colour changes at every pixel, and from which value on that is an edge in
 * this picture: in a noisy or busy one every pixel changes a little, and an edge has to stand
 * out from that.
 * @param {Float32Array} lab  OKLab per pixel
 * @returns {{strength: Float32Array, edge: number}}
 */
export function edgeStrength(lab, width, height) {
  const count = width * height
  const radius = Math.max(1, Math.round(Math.sqrt(count) * 0.003))
  const channels = [0, 1, 2].map((c) => {
    const values = new Float32Array(count)
    const weight = c ? CHROMA_WEIGHT : 1
    for (let p = 0; p < count; p++) values[p] = lab[p * 3 + c] * weight
    return soften(values, width, height, radius)
  })
  const strength = new Float32Array(count)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      let m = 0
      for (const v of channels) {
        const dx = (v[p - width + 1] + 2 * v[p + 1] + v[p + width + 1] - v[p - width - 1] - 2 * v[p - 1] - v[p + width - 1]) / 8
        const dy = (v[p + width - 1] + 2 * v[p + width] + v[p + width + 1] - v[p - width - 1] - 2 * v[p - width] - v[p - width + 1]) / 8
        m += dx * dx + dy * dy
      }
      strength[p] = Math.sqrt(m)
    }
  }
  const sample = []
  for (let p = 0; p < count; p += 7) sample.push(strength[p])
  sample.sort((a, b) => a - b)
  const edge = Math.max(EDGE, sample[Math.floor(sample.length * 0.5)] * 3.5, sample[Math.floor(sample.length * 0.85)] * 1.4)
  return { strength, edge }
}

/**
 * Joins neighbouring areas whose common border is no edge in the picture, and areas too small
 * to colour in, each with the neighbour it is least separated from.
 * @param {Int32Array} regionMap  area per pixel
 * @param {Float32Array} strength  see `edgeStrength`
 * @param {{threshold: number, minArea: number}} options  a border weaker than `threshold` on average is none
 * @returns {Int32Array} shape per pixel
 */
export function joinAreas(regionMap, regionCount, strength, width, height, { threshold, minArea }) {
  const root = Int32Array.from({ length: regionCount }, (_, i) => i)
  const find = (r) => {
    while (root[r] !== r) { root[r] = root[root[r]]; r = root[r] }
    return r
  }
  // Round by round, so that every join is judged on the whole border of what was joined before:
  // a shape must not slip into its background through one weak stretch.
  for (let round = 0; round < 80; round++) {
    const size = new Int32Array(regionCount)
    const borders = new Map() // a * count + b -> [length, summed strength]
    const note = (a, b, s) => {
      const key = a < b ? a * regionCount + b : b * regionCount + a
      const border = borders.get(key)
      if (border) { border[0]++; border[1] += s } else borders.set(key, [1, s])
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        const a = find(regionMap[p])
        size[a]++
        if (x < width - 1) { const b = find(regionMap[p + 1]); if (b !== a) note(a, b, Math.max(strength[p], strength[p + 1])) }
        if (y < height - 1) { const b = find(regionMap[p + width]); if (b !== a) note(a, b, Math.max(strength[p], strength[p + width])) }
      }
    }
    const pairs = [...borders].map(([key, [length, sum]]) => ({ a: Math.floor(key / regionCount), b: key % regionCount, mean: sum / length }))
    pairs.sort((x, y) => x.mean - y.mean || x.a - y.a || x.b - y.b)
    const taken = new Uint8Array(regionCount)
    let joined = false
    for (const { a, b, mean } of pairs) {
      if (taken[a] || taken[b]) continue
      if (mean >= threshold && size[a] >= minArea && size[b] >= minArea) continue
      // The smaller one goes into the larger one.
      if (size[a] >= size[b]) root[b] = a
      else root[a] = b
      taken[a] = taken[b] = 1
      joined = true
    }
    if (!joined) break
  }
  const shapes = new Int32Array(regionMap.length)
  for (let p = 0; p < shapes.length; p++) shapes[p] = find(regionMap[p])
  return shapes
}

// Douglas-Peucker on the points a..b of a line: marks the ones to keep.
function reduce(xs, ys, a, b, tolerance, keep) {
  const stack = [a, b]
  while (stack.length) {
    const to = stack.pop(), from = stack.pop()
    const dx = xs[to] - xs[from], dy = ys[to] - ys[from]
    const length = Math.sqrt(dx * dx + dy * dy)
    let far = -1, most = tolerance
    for (let i = from + 1; i < to; i++) {
      const px = xs[i] - xs[from], py = ys[i] - ys[from]
      const d = length ? Math.abs(px * dy - py * dx) / length : Math.sqrt(px * px + py * py)
      if (d > most) { most = d; far = i }
    }
    if (far < 0) continue
    keep[far] = 1
    stack.push(from, far, far, to)
  }
}

/**
 * The borders between the shapes as lines: from one meeting point of three shapes to the next,
 * or closed where a shape lies inside another. Every border is one line, shared by the shapes
 * on both sides, reduced to the few points a smooth curve needs.
 * @param {Int32Array} shapes  shape per pixel
 * @param {number} tolerance  how far a line may leave the border, in pixels
 * @returns {Array<{points: number[], closed: boolean}>}  points = x0, y0, x1, y1, ...
 */
export function outlinePaths(shapes, width, height, tolerance = 1.5) {
  const W = width + 1
  // Per corner of the pixel grid: which of the four pieces of border around it exist.
  const RIGHT = 1, DOWN = 2, LEFT = 4, UP = 8
  const links = new Uint8Array(W * (height + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1 && shapes[p] !== shapes[p + 1]) { links[y * W + x + 1] |= DOWN; links[(y + 1) * W + x + 1] |= UP }
      if (y < height - 1 && shapes[p] !== shapes[p + width]) { links[(y + 1) * W + x] |= RIGHT; links[(y + 1) * W + x + 1] |= LEFT }
    }
  }
  const degree = (c) => { const l = links[c]; return (l & 1) + ((l >> 1) & 1) + ((l >> 2) & 1) + ((l >> 3) & 1) }
  const step = { [RIGHT]: 1, [DOWN]: W, [LEFT]: -1, [UP]: -W }
  const back = { [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT, [UP]: DOWN }
  const paths = []
  // Walks from corner `c` along `dir` until a meeting point, the edge of the picture or the start.
  const walk = (start, dir) => {
    const xs = [start % W], ys = [Math.floor(start / W)]
    let c = start
    for (;;) {
      links[c] &= ~dir
      c += step[dir]
      links[c] &= ~back[dir]
      xs.push(c % W); ys.push(Math.floor(c / W))
      if (c === start || nodes[c] || !links[c]) break
      dir = links[c] & -links[c] // the one piece that is left
    }
    return { xs, ys, closed: c === start }
  }
  // Meeting points and ends are fixed before any line is walked.
  const nodes = new Uint8Array(links.length)
  for (let c = 0; c < links.length; c++) if (links[c] && degree(c) !== 2) nodes[c] = 1
  const lines = []
  for (let c = 0; c < links.length; c++) {
    if (!nodes[c]) continue
    for (const dir of [RIGHT, DOWN, LEFT, UP]) if (links[c] & dir) lines.push(walk(c, dir))
  }
  for (let c = 0; c < links.length; c++) {
    while (links[c]) lines.push(walk(c, links[c] & -links[c]))
  }
  for (const { xs, ys, closed } of lines) {
    const n = xs.length
    const keep = new Uint8Array(n)
    keep[0] = keep[n - 1] = 1
    if (closed) {
      // A closed line is cut at the point farthest from its start.
      let far = 0, most = -1
      for (let i = 1; i < n - 1; i++) {
        const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2
        if (d > most) { most = d; far = i }
      }
      keep[far] = 1
      reduce(xs, ys, 0, far, tolerance, keep)
      reduce(xs, ys, far, n - 1, tolerance, keep)
    } else reduce(xs, ys, 0, n - 1, tolerance, keep)
    const points = []
    for (let i = 0; i < (closed ? n - 1 : n); i++) if (keep[i]) points.push(xs[i], ys[i])
    if (points.length >= (closed ? 6 : 4)) paths.push({ points, closed })
  }
  return paths
}

/**
 * The control points that turn a line of points into one smooth curve through all of them
 * (Catmull-Rom as cubic Bezier pieces).
 * @returns {number[][]} per piece [c1x, c1y, c2x, c2y, x, y], to follow a move to the first point
 */
export function smoothCurve(points, closed) {
  const n = points.length / 2
  const at = (i) => {
    const k = closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))
    return [points[k * 2], points[k * 2 + 1]]
  }
  const pieces = []
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = at(i - 1), [x1, y1] = at(i), [x2, y2] = at(i + 1), [x3, y3] = at(i + 2)
    pieces.push([x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2])
  }
  return pieces
}

/**
 * The sketch of a picture: closed shapes with smooth outlines.
 * @param {Uint8ClampedArray} rgba  the picture at working resolution
 * @param {{subjects?: number[][]}} options  boxes [left, top, right, bottom] (0..1) of the main
 *   subjects; lines inside them are firm, the others light
 * @returns {{width: number, height: number, paths: Array<{points: number[], closed: boolean, firm: boolean}>}}
 */
export function colouringSketch(rgba, width, height, { subjects = null } = {}) {
  const count = width * height
  // Calm areas of few colours: what a colouring book would outline.
  const { regionMap, regions } = segmentImage(rgba, width, height, { colours: 16, simplify: 7 })
  const { strength } = edgeStrength(toOklabPixels(rgba, count), width, height)
  const sorted = Float32Array.from(strength).sort()
  // A border is none when the colour hardly changes across it: less than a real edge, and
  // hardly more than the picture changes anyway (its noise or texture).
  const threshold = Math.max(WEAK_BORDER, sorted[sorted.length >> 1] * 1.5)
  const minArea = Math.round(count * 0.0012)
  let shapes = joinAreas(regionMap, regions.length, strength, width, height, { threshold, minArea })
  // Rounder borders: every pixel goes with most of its neighbours, and what that leaves over is joined again.
  const ids = new Map()
  for (let p = 0; p < count; p++) {
    if (!ids.has(shapes[p])) ids.set(shapes[p], ids.size)
    shapes[p] = ids.get(shapes[p])
  }
  const rounded = connectedComponents(majorityFilter(shapes, width, height, ids.size, 3), width, height)
  shapes = joinAreas(rounded.regionMap, rounded.regionCluster.length, strength, width, height, { threshold: 0, minArea })
  const strong = subjects?.length ? boxMask(subjects, width, height, 0.05) : null
  const paths = outlinePaths(shapes, width, height, Math.max(1.5, Math.sqrt(count) * 0.0036)).map((path) => {
    let inside = 0
    const n = path.points.length / 2
    for (let i = 0; i < n; i++) {
      const x = Math.min(width - 1, path.points[i * 2]), y = Math.min(height - 1, path.points[i * 2 + 1])
      if (!strong || strong[y * width + x]) inside++
    }
    return { ...path, firm: inside * 2 > n }
  })
  return { width, height, paths }
}
