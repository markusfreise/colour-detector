// What a painter puts in last and draws first: the small dark details that carry a picture
// (eyes, a mouth, a window), and the edges of its shapes as a pencil sketch.
// Where to look comes from boxes (from the AI's answer); what is there is taken from the picture.

import { connectedComponents } from './segment.js'

// A detail is this much darker than its surroundings (OKLab lightness), and not light in itself.
const DARKER = 0.07
const DARK_BELOW = 0.62
// Specks smaller than this are no brush stroke.
const MIN_SHAPE = 5
// The final wash is for details: it never covers more than this part of the picture.
const MAX_SHARE = 0.04

/**
 * Pixels inside the boxes. A box is [left, top, right, bottom] as parts of the picture (0..1);
 * `pad` widens it by that part of its own size, since boxes from a model are approximate.
 */
export function boxMask(boxes, width, height, pad = 0.15) {
  const mask = new Uint8Array(width * height)
  for (const [left, top, right, bottom] of boxes) {
    const px = (right - left) * pad, py = (bottom - top) * pad
    const x0 = Math.max(0, Math.floor((left - px) * width)), x1 = Math.min(width - 1, Math.ceil((right + px) * width))
    const y0 = Math.max(0, Math.floor((top - py) * height)), y1 = Math.min(height - 1, Math.ceil((bottom + py) * height))
    for (let y = y0; y <= y1; y++) mask.fill(1, y * width + x0, y * width + x1 + 1)
  }
  return mask
}

// Mean lightness around every pixel, over a square of the given radius.
function localLightness(lab, width, height, radius) {
  const sums = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += lab[(y * width + x) * 3]
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row
    }
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1)
      const sum = sums[y1 * (width + 1) + x1] - sums[y0 * (width + 1) + x1] - sums[y1 * (width + 1) + x0] + sums[y0 * (width + 1) + x0]
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

/**
 * The final wash: the fine dark shapes inside the boxes, the ones that are clearly darker than
 * what is around them.
 * @param {Float32Array} lab  OKLab per pixel
 * @param {Uint8Array} where  1 = inside a box (see `boxMask`)
 * @returns {{mask: Uint8Array, pixels: number, shapes: number, lab: number[]|null}}
 *   mask = 1 where the wash goes; lab = its mean colour in the picture, null when nothing is found
 */
export function detailWash(lab, width, height, where) {
  const count = width * height
  const around = localLightness(lab, width, height, Math.max(3, Math.round(Math.sqrt(count) * 0.012)))
  let mask = new Int32Array(count)
  // Stricter until the wash is small enough to be details.
  for (let darker = DARKER; darker < 0.4; darker += 0.03) {
    let n = 0
    for (let p = 0; p < count; p++) {
      const L = lab[p * 3]
      mask[p] = where[p] && L < DARK_BELOW && L < around[p] - darker ? 1 : 0
      n += mask[p]
    }
    if (n <= count * MAX_SHARE) break
  }
  const { regionMap, regionCluster, regionSize } = connectedComponents(mask, width, height)
  const out = new Uint8Array(count)
  const sum = [0, 0, 0]
  let pixels = 0, shapes = 0
  const counted = new Uint8Array(regionCluster.length)
  for (let p = 0; p < count; p++) {
    const r = regionMap[p]
    if (!regionCluster[r] || regionSize[r] < MIN_SHAPE) continue
    out[p] = 1
    pixels++
    if (!counted[r]) { counted[r] = 1; shapes++ }
    sum[0] += lab[p * 3]; sum[1] += lab[p * 3 + 1]; sum[2] += lab[p * 3 + 2]
  }
  return { mask: out, pixels, shapes, lab: pixels ? sum.map((v) => v / pixels) : null }
}

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

// An edge counts from this change of colour per pixel on (OKLab); weaker ones only as part of a stronger line.
const EDGE = 0.022
const EDGE_WEAK = 0.4
// Colour differences count for more than lightness: a shape often differs from its surroundings in hue only.
const CHROMA_WEIGHT = 1.6

/**
 * The lines of a pencil sketch from the edges of the picture itself: where the colour changes
 * sharply along a line of some length. Mist, soft gradients and texture give no lines.
 * 0 = paper, 1 = a light line, 2 = a firm line. With `strong` (the main subjects) the lines
 * inside it are firm and the ones outside need to be longer to be drawn at all.
 * @param {Float32Array} lab  OKLab per pixel
 * @param {Uint8Array|null} strong  1 = inside a main subject
 */
export function edgeSketch(lab, width, height, strong = null) {
  const count = width * height
  const side = Math.sqrt(count)
  const radius = Math.max(1, Math.round(side * 0.003))
  const channels = [0, 1, 2].map((c) => {
    const values = new Float32Array(count)
    const weight = c ? CHROMA_WEIGHT : 1
    for (let p = 0; p < count; p++) values[p] = lab[p * 3 + c] * weight
    return soften(values, width, height, radius)
  })
  // Strength and direction of the change at every pixel.
  const mag = new Float32Array(count), gx = new Float32Array(count), gy = new Float32Array(count)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      let sx = 0, sy = 0, m = 0
      for (const v of channels) {
        const dx = (v[p - width + 1] + 2 * v[p + 1] + v[p + width + 1] - v[p - width - 1] - 2 * v[p - 1] - v[p + width - 1]) / 8
        const dy = (v[p + width - 1] + 2 * v[p + width] + v[p + width + 1] - v[p - width - 1] - 2 * v[p - width] - v[p - width + 1]) / 8
        m += dx * dx + dy * dy
        // The direction of the channel that changes most decides where the line runs.
        if (dx * dx + dy * dy > sx * sx + sy * sy) { sx = dx; sy = dy }
      }
      mag[p] = Math.sqrt(m); gx[p] = sx; gy[p] = sy
    }
  }
  // In a noisy or busy picture every pixel changes a little: an edge has to stand out from that.
  const sample = []
  for (let p = 0; p < count; p += 7) sample.push(mag[p])
  sample.sort((a, b) => a - b)
  const edge = Math.max(EDGE, sample[Math.floor(sample.length * 0.5)] * 3.5, sample[Math.floor(sample.length * 0.85)] * 1.4)
  // Thin lines: a pixel stays only where it is the strongest across its edge.
  const thin = new Float32Array(count)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      const m = mag[p]
      if (m < edge * EDGE_WEAK) continue
      const ax = Math.abs(gx[p]), ay = Math.abs(gy[p])
      let q1, q2
      if (ax > ay * 2.414) { q1 = p - 1; q2 = p + 1 }
      else if (ay > ax * 2.414) { q1 = p - width; q2 = p + width }
      else if (gx[p] * gy[p] > 0) { q1 = p - width - 1; q2 = p + width + 1 }
      else { q1 = p - width + 1; q2 = p + width - 1 }
      if (m >= mag[q1] && m > mag[q2]) thin[p] = m
    }
  }
  // Lines: pixels that hang together, kept when they hold a clear edge and are long enough.
  const lines = new Uint8Array(count)
  const seen = new Uint8Array(count)
  const stack = new Int32Array(count)
  const minLength = Math.max(8, Math.round(side * 0.03))
  for (let start = 0; start < count; start++) {
    if (!thin[start] || seen[start]) continue
    let top = 0, size = 0, peak = 0, inside = 0
    stack[top++] = start
    seen[start] = 1
    const members = []
    while (top) {
      const p = stack[--top]
      members.push(p)
      size++
      if (thin[p] > peak) peak = thin[p]
      if (strong?.[p]) inside++
      const x = p % width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const q = p + dy * width + dx
          if ((!dx && !dy) || q < 0 || q >= count || x + dx < 0 || x + dx >= width || seen[q] || !thin[q]) continue
          seen[q] = 1
          stack[top++] = q
        }
      }
    }
    if (peak < edge) continue
    const subject = !strong || inside * 2 > size
    // Outside the main subjects only long, clear lines are worth drawing.
    if (size < (subject ? minLength : minLength * 3)) continue
    const firm = strong ? subject : peak >= edge * 1.8
    for (const p of members) lines[p] = firm ? 2 : 1
  }
  return lines
}
