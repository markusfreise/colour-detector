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
