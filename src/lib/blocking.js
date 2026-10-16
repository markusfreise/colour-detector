// Blocking: the picture as two or three flat tones of hard contrast in large masses, to find light,
// shadow and the overall forms before painting. Lightness is CIE L* (0 black .. 100 white), the
// lightness the eye sees, not an average of red, green and blue.
import { srgbToLinear } from './color.js'
import { majorityFilter, mergeSmallRegions, connectedComponents, labelAnchors } from './segment.js'
import { roundOutlines } from './smooth.js'

export const MIN_TONES = 2
export const MAX_TONES = 3
export const DEFAULT_FORMS = 6 // "Forms": 0 = more detail .. 10 = the largest masses
// The greys the tones are shown in, as L*: the paper, a middle tone, a strong dark.
const TONE_LIGHTNESS = { 2: [100, 24], 3: [100, 60, 24] }

const LINEAR = Float32Array.from({ length: 256 }, (_, v) => srgbToLinear(v))
const lstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y)

/** CIE L* of an sRGB colour (D65): from the luminance Y of linear red, green and blue. */
export function lightnessOf(r, g, b) {
  return lstar(0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b])
}

/** L* of every pixel of RGBA data. */
export function lightnessMap(rgba, count) {
  const out = new Float32Array(count)
  for (let p = 0; p < count; p++) out[p] = lightnessOf(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2])
  return out
}

/** How many pixels have each L*, in `bins` steps from 0 to 100. */
export function histogram(L, bins = 100) {
  const out = new Float64Array(bins)
  for (let p = 0; p < L.length; p++) out[Math.min(bins - 1, Math.max(0, Math.floor((L[p] / 100) * bins)))]++
  return out
}

/**
 * Where the photo itself divides into light and dark: the thresholds (L*, ascending) that keep
 * the tones apart as well as they can (Otsu's method; for three tones the best pair of two).
 */
export function naturalSplit(hist, tones = 2) {
  const bins = hist.length
  const count = new Float64Array(bins + 1)
  const sum = new Float64Array(bins + 1)
  for (let i = 0; i < bins; i++) {
    count[i + 1] = count[i] + hist[i]
    sum[i + 1] = sum[i] + hist[i] * (i + 0.5)
  }
  // The share of the spread between the groups that a group from bin a to bin b (exclusive) adds.
  const part = (a, b) => {
    const n = count[b] - count[a]
    return n > 0 ? (sum[b] - sum[a]) ** 2 / n : 0
  }
  const edge = (i) => (i / bins) * 100
  if (tones <= 2) {
    let best = 1, score = -1
    for (let t = 1; t < bins; t++) {
      const s = part(0, t) + part(t, bins)
      if (s > score) [best, score] = [t, s]
    }
    return [edge(best)]
  }
  let best = [1, 2], score = -1
  for (let t1 = 1; t1 < bins - 1; t1++) {
    for (let t2 = t1 + 1; t2 < bins; t2++) {
      const s = part(0, t1) + part(t1, t2) + part(t2, bins)
      if (s > score) [best, score] = [[t1, t2], s]
    }
  }
  return best.map(edge)
}

/** The tone of a lightness: 0 the lightest, counting down past each threshold it is below. */
export function toneOf(lightness, thresholds) {
  let tone = 0
  for (const t of thresholds) if (lightness < t) tone++
  return tone
}

/** The tone of a colour given as hex. */
export function toneOfHex(hex, thresholds) {
  const n = parseInt(hex.replace('#', ''), 16)
  return toneOf(lightnessOf((n >> 16) & 255, (n >> 8) & 255, n & 255), thresholds)
}

/** The grey a tone is shown in, as [r, g, b]. */
export function toneGrey(tone, tones) {
  const L = TONE_LIGHTNESS[tones]?.[tone] ?? 100
  // From L* back to an sRGB grey.
  const y = L > 8 ? ((L + 16) / 116) ** 3 : L / (24389 / 27)
  const v = Math.round(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055))
  return [v, v, v]
}

// A blur of the lightness, so that the masses come from the large shapes and not from texture.
function blurred(L, width, height, radius) {
  if (radius < 1) return L
  const tmp = new Float32Array(L.length)
  const out = new Float32Array(L.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let acc = 0
    for (let dx = -radius; dx <= radius; dx++) acc += L[row + Math.min(width - 1, Math.max(0, dx))]
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / (2 * radius + 1)
      acc += L[row + Math.min(width - 1, x + radius + 1)] - L[row + Math.max(0, x - radius)]
    }
  }
  for (let x = 0; x < width; x++) {
    let acc = 0
    for (let dy = -radius; dy <= radius; dy++) acc += tmp[Math.min(height - 1, Math.max(0, dy)) * width + x]
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / (2 * radius + 1)
      acc += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x]
    }
  }
  return out
}

/**
 * The picture as tones in large masses.
 * @param {Uint8ClampedArray} rgba
 * @param {object} options
 *   tones: 2 (light and shadow) or 3 (with a middle tone);
 *   split: thresholds in L*, one fewer than tones; null = where the photo divides (naturalSplit);
 *   forms: 0 (more detail) to 10 (the largest masses).
 * @returns {{ width, height, tones, thresholds, natural, toneMap: Int32Array, regionMap: Int32Array,
 *   regions: { id, tone, size, anchorX, anchorY, anchorDist }[], shares: number[] }}
 */
export function blockImage(rgba, width, height, { tones = 2, split = null, forms = DEFAULT_FORMS } = {}) {
  tones = Math.min(MAX_TONES, Math.max(MIN_TONES, Math.round(tones)))
  const count = width * height
  const L = lightnessMap(rgba, count)
  const natural = naturalSplit(histogram(L), tones)
  const thresholds = split?.length === tones - 1 ? [...split].sort((a, b) => a - b) : natural
  // Sizes grow with the picture, so that a close-up and the whole picture look alike.
  const size = Math.sqrt(count) / 700
  const f = Math.min(10, Math.max(0, forms))
  const soft = blurred(L, width, height, Math.round(f * 0.8 * size))
  let labels = new Int32Array(count)
  for (let p = 0; p < count; p++) labels[p] = toneOf(soft[p], thresholds)
  if (f > 0) labels = majorityFilter(labels, width, height, tones, 2)
  labels = roundOutlines(labels, width, height, tones, { radius: Math.round(f * 0.5 * size), passes: 1 })
  labels = mergeSmallRegions(labels, width, height, Math.max(4, count * (0.00002 + f * f * 0.00012)))
  const { regionMap, regionCluster, regionSize } = connectedComponents(labels, width, height)
  const anchors = labelAnchors(regionMap, width, height, regionCluster.length)
  const shares = new Array(tones).fill(0)
  for (let r = 0; r < regionCluster.length; r++) shares[regionCluster[r]] += regionSize[r] / count
  return {
    width,
    height,
    tones,
    thresholds,
    natural,
    toneMap: labels,
    regionMap,
    regions: regionCluster.map((tone, id) => ({ id, tone, size: regionSize[id], anchorX: anchors[id].x, anchorY: anchors[id].y, anchorDist: anchors[id].d })),
    shares,
  }
}
