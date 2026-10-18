// Image segmentation into flat colour areas ("paint-by-numbers" style).
//
// 1. Noise goes: the picture is cut into small patches along its edges and every pixel takes the
//    colour of its patch (smooth.js).
// 2. Clustering into mixes (absorbance directions) and their washes -> one label per pixel.
// 3. Calm areas (`calmAreas`): the details that stay are found (an eye, a letter), areas that are
//    too small or too alike join, and the outlines are rounded. Simplify only turns this step up;
//    the colours found do not change with it.
// 4. Connected components and a label anchor per region (the pixel furthest from its border).
//
// Pure functions on typed arrays so it runs in a Web Worker and in tests.

import { srgbToLinear, linearToOklab, oklabToLinear, oklabToHex, hexToOklab } from './color.js'
import { geometricAreas } from './geometric.js'
import { boxMask } from './details.js'
import { compactPatches, settlePatches, patchColours, findDetails, mergeAreas, roundOutlines } from './smooth.js'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function boxBlur(rgba, width, height, radius) {
  if (radius < 1) return rgba
  const out = new Uint8ClampedArray(rgba.length)
  const tmp = new Float32Array(rgba.length)
  // horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const i = (y * width + xx) * 4
        r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++
      }
      const o = (y * width + x) * 4
      tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n
    }
  }
  // vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const i = (yy * width + x) * 4
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; n++
      }
      const o = (y * width + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return out
}

export function toOklabPixels(rgba, count) {
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i)
  const lab = new Float32Array(count * 3)
  for (let p = 0; p < count; p++) {
    const [L, a, b] = linearToOklab([lut[rgba[p * 4]], lut[rgba[p * 4 + 1]], lut[rgba[p * 4 + 2]]])
    lab[p * 3] = L; lab[p * 3 + 1] = a; lab[p * 3 + 2] = b
  }
  return lab
}

// Weight of a colour in the clustering = (its pixel count) ^ AREA_POWER; 1 would follow the pixel
// count, and a photo that is mostly dark background would then spend every colour on that
// background and lose the small, colourful parts (lips, a flower, a sign).
export const AREA_POWER = 0.4
// When colours are sorted into mixes, a difference in lightness counts this much of a difference
// in hue or saturation: a lighter or darker version of a colour is cheap for a painter, a new hue
// needs a new mix. Lower values keep small areas of a different hue (a yellow light on a red
// stage) at the price of fewer steps between similar colours.
export const LIGHTNESS_WEIGHT = 0.5

/**
 * The two weights above as the Details slider (0..10) sets them. At 5 they are the constants. Higher
 * Details weighs small colours more and lightness less, so a small area of another hue gets a mix
 * of its own already here; lower weighs colours by area and lightness more, so the large areas get
 * finer steps. `planMixes` reads the same slider when it joins mixes, but that only acts when the
 * analysis found more mixes than wanted: on a calm picture or with a small paint box it did not, and
 * the slider did nothing.
 */
export function varietyWeights(variety = 5) {
  const off = (5 - Math.min(10, Math.max(0, variety))) / 5 // 1 at Details 0, −1 at Details 10
  return { areaPower: AREA_POWER + 0.4 * off, lightnessWeight: LIGHTNESS_WEIGHT * Math.pow(2, off) }
}
// A mix is painted in at most this many washes (water levels).
export const MAX_WASHES = 5
// One more wash for every factor of about 1.7 between the weakest and the strongest part of a mix.
export const WASH_STEP = 0.55
const MIN_REFLECTANCE = 0.0005

// Side of the patches the picture is cut into before its colours are found, in pixels.
const PATCH_STEP = 5
// Patches closer in colour than about this (OKLab) are evened out with each other.
const PATCH_BLEND = 0.035
// Sizes in pixels are meant for a picture of this many pixels and scale with the picture
// (areas with its pixels, the rounding window with its side).
const REFERENCE_PIXELS = 480000
// The highest step of Simplify.
const TOP_SIMPLIFY = 10
// The lowest step of Simplify. Below 0 it goes the other way: what calms the areas at every step
// from 0 on (the patches, the joining, the texture, the rounding) is taken back evenly, and at
// FINEST none of it is left: the areas follow the photo, down to SMALLEST_AREA.
export const FINEST = -4
// The step of Simplify that is shown as 0 and opens a picture; the steps below it are Pro.
export const SIMPLIFY_ZERO = -2
// The smallest area that is no detail, in pixels at Simplify 0; it grows with (Simplify + 1) ^ MIN_AREA_POWER.
const MIN_AREA = 72
const MIN_AREA_POWER = 1.3
// Nothing smaller than this many pixels is ever an area of its own, whatever the size of the picture.
const SMALLEST_AREA = 6
// Two areas join while that costs less than this at Simplify 0 (see `mergeAreas` for the cost),
// and MERGE_GROWTH times more with every step of Simplify.
const MERGE_LIMIT = 0.02
const MERGE_GROWTH = 1.25
// Before the details are looked for, the pieces of one thing join: at this part of MERGE_LIMIT.
const TIDY_LIMIT = 0.25
// A small area is a detail when losing it would cost at least this at Simplify 0 (see
// `findDetails`), and 1 + DETAIL_RISE x step ^ 3 times that further up: hardly more up to the
// middle of Simplify, so that a face still has eyes when its cheeks are one area, and about nine
// times as much at the top, where only what is as strong as black writing on white is left.
const DETAIL_LIMIT = 0.04
const DETAIL_RISE = 0.008
// A detail also has to count as this many pixels at Simplify 0 (see `findDetails`; less is no
// more than a touch of the brush), and DETAIL_SIZE_GROWTH times more with every step, so that
// the specks go first.
const DETAIL_SIZE = 6
const DETAIL_SIZE_GROWTH = 1.35
// Rounding of the outlines: the window around a pixel at Simplify 0, and what a step of Simplify adds.
const OUTLINE_RADIUS = 3
const OUTLINE_RADIUS_STEP = 0.3
const OUTLINE_PASSES = 2
// Inside a focus box the areas are as at Simplify 0, and both limits are this part of theirs there.
const FOCUS_LIMIT = 0.5
// Texture is looked for in cells of this many pixels a side in a picture of REFERENCE_PIXELS
// (see `dropTexture` in smooth.js); the cells scale with the side of the picture.
const TEXTURE_CELL = 16
// In a zone of texture the smallest area is that of this many steps of Simplify further up, and
// the outlines are rounded as that many further up.
const TEXTURE_STEPS = 1.5
const TEXTURE_ROUNDER = 3

const BIN_L = 50 // histogram steps per unit of L
const BIN_AB = 100 // histogram steps per unit of a and b

/**
 * Histogram of the picture's colours in OKLab: one point per occupied bin (mean colour, pixel count).
 * Clustering runs on these points, so it is exact (no sampling) and independent of the picture size.
 */
export function colourBins(lab, count) {
  const index = new Map()
  const sums = []
  const counts = []
  const binOf = new Int32Array(count)
  for (let p = 0; p < count; p++) {
    const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
    const key = Math.round(L * BIN_L) * 1048576 + (Math.round(a * BIN_AB) + 512) * 1024 + Math.round(b * BIN_AB) + 512
    let i = index.get(key)
    if (i === undefined) {
      i = counts.length
      index.set(key, i)
      sums.push(0, 0, 0)
      counts.push(0)
    }
    sums[i * 3] += L; sums[i * 3 + 1] += a; sums[i * 3 + 2] += b
    counts[i]++
    binOf[p] = i
  }
  const n = counts.length
  const points = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    points[i * 3] = sums[i * 3] / counts[i]
    points[i * 3 + 1] = sums[i * 3 + 1] / counts[i]
    points[i * 3 + 2] = sums[i * 3 + 2] / counts[i]
  }
  return { points, counts: Float64Array.from(counts), binOf }
}

/**
 * Cluster the picture into `k` mixes, each painted in one or more washes.
 *
 * A watercolour mix with more or less water keeps the direction of its absorbance
 * (A = -ln reflectance) and only changes its length. So a mix is a direction, and a colour
 * belongs to the mix whose best wash comes closest to it (OKLab distance). Colours that differ
 * only in strength therefore share a mix instead of using up one each. Within a mix the
 * strengths are then split into washes.
 *
 * With `anchors` (colours as OKLab triples) the mixes are given instead of found: every anchor is
 * a mix, the colours are only assigned to them and `k` is not used.
 *
 * @returns {{labels: Int32Array, clusters: Array<{group:number, level:number}>}}
 *   labels = cluster per pixel; clusters are ordered mix by mix, lightest wash first
 */
export function clusterWashes(lab, count, k, { iterations = 24, seed = 7, areaPower = AREA_POWER, maxWashes = MAX_WASHES, washStep = WASH_STEP, lightnessWeight = LIGHTNESS_WEIGHT, anchors = null } = {}) {
  const rand = mulberry32(seed)
  const { points, counts, binOf } = colourBins(lab, count)
  const n = counts.length
  const kk = anchors?.length ? anchors.length : Math.max(1, Math.min(k, n))
  const absorb = new Float64Array(n * 3)
  const weight = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const linear = oklabToLinear([points[i * 3], points[i * 3 + 1], points[i * 3 + 2]])
    for (let j = 0; j < 3; j++) absorb[i * 3 + j] = -Math.log(Math.min(1, Math.max(MIN_REFLECTANCE, linear[j])))
    weight[i] = Math.pow(counts[i], areaPower)
  }
  const dirs = new Float64Array(kk * 3)
  const setDir = (c, x, y, z) => {
    const len = Math.hypot(x, y, z)
    // No absorbance at all (pure white) has no direction: use neutral grey.
    if (len < 1e-9) { dirs[c * 3] = dirs[c * 3 + 1] = dirs[c * 3 + 2] = Math.SQRT1_2 * Math.sqrt(2 / 3) }
    else { dirs[c * 3] = x / len; dirs[c * 3 + 1] = y / len; dirs[c * 3 + 2] = z / len }
  }
  // Strength of bin i as a wash of mix c: its absorbance projected on the mix direction.
  const strength = (i, c) => Math.max(0, absorb[i * 3] * dirs[c * 3] + absorb[i * 3 + 1] * dirs[c * 3 + 1] + absorb[i * 3 + 2] * dirs[c * 3 + 2])
  // Squared OKLab distance between bin i and the closest wash of mix c.
  const d2 = (i, c) => {
    const t = strength(i, c)
    const [L, a, b] = linearToOklab([Math.exp(-t * dirs[c * 3]), Math.exp(-t * dirs[c * 3 + 1]), Math.exp(-t * dirs[c * 3 + 2])])
    const dL = L - points[i * 3], da = a - points[i * 3 + 1], db = b - points[i * 3 + 2]
    return lightnessWeight * lightnessWeight * dL * dL + da * da + db * db
  }

  // k-means++ seeding: the first mix is the most common colour, the rest are drawn
  // with probability weight x squared distance to the nearest mix so far.
  let first = 0
  for (let i = 1; i < n; i++) if (counts[i] > counts[first]) first = i
  if (anchors?.length) {
    // Given mixes: the direction of each anchor's absorbance, kept as it is.
    anchors.forEach((anchor, c) => {
      const linear = oklabToLinear(anchor)
      setDir(c, ...linear.map((v) => -Math.log(Math.min(1, Math.max(MIN_REFLECTANCE, v)))))
    })
    iterations = 1
  } else setDir(0, absorb[first * 3], absorb[first * 3 + 1], absorb[first * 3 + 2])
  const d = new Float64Array(n).fill(Infinity)
  for (let c = 1; c < kk && !anchors?.length; c++) {
    let sum = 0
    for (let i = 0; i < n; i++) {
      d[i] = Math.min(d[i], d2(i, c - 1))
      sum += d[i] * weight[i]
    }
    let r = rand() * sum
    let chosen = n - 1
    for (let i = 0; i < n; i++) {
      r -= d[i] * weight[i]
      if (r <= 0) { chosen = i; break }
    }
    setDir(c, absorb[chosen * 3], absorb[chosen * 3 + 1], absorb[chosen * 3 + 2])
  }

  // Lloyd iterations: assign every bin to its closest mix, then turn each mix to the
  // weighted mean absorbance of its bins.
  const group = new Int32Array(n)
  for (let it = 0; it < iterations; it++) {
    let changed = it === 0
    const sums = new Float64Array(kk * 3)
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity
      for (let c = 0; c < kk; c++) {
        const dd = d2(i, c)
        if (dd < bestD) { bestD = dd; best = c }
      }
      if (group[i] !== best) { group[i] = best; changed = true }
      const w = weight[i]
      sums[best * 3] += absorb[i * 3] * w; sums[best * 3 + 1] += absorb[i * 3 + 1] * w; sums[best * 3 + 2] += absorb[i * 3 + 2] * w
    }
    if (!changed || anchors?.length) break
    for (let c = 0; c < kk; c++) {
      if (sums[c * 3] + sums[c * 3 + 1] + sums[c * 3 + 2] > 1e-9) setDir(c, sums[c * 3], sums[c * 3 + 1], sums[c * 3 + 2])
    }
  }

  // Washes: split every mix by strength (log scale, like the water levels of a recipe).
  const clusters = []
  const clusterOfBin = new Int32Array(n)
  for (let c = 0; c < kk; c++) {
    const members = []
    for (let i = 0; i < n; i++) if (group[i] === c) members.push(i)
    if (!members.length) continue
    const logS = new Map(members.map((i) => [i, Math.log(Math.max(0.02, strength(i, c)))]))
    members.sort((x, y) => logS.get(x) - logS.get(y))
    // Range between the 2% and 98% points by pixel count, so a few stray pixels add no wash.
    const total = members.reduce((sum, i) => sum + counts[i], 0)
    const at = (share) => {
      let run = 0
      for (const i of members) { run += counts[i]; if (run >= total * share) return logS.get(i) }
      return logS.get(members[members.length - 1])
    }
    const lo = at(0.02), hi = at(0.98)
    const levels = Math.max(1, Math.min(maxWashes, members.length, 1 + Math.round((hi - lo) / washStep)))
    const centres = Array.from({ length: levels }, (_, l) => (levels === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * l) / (levels - 1)))
    const level = new Map()
    for (let it = 0; it < 12; it++) {
      const sum = new Float64Array(levels), w = new Float64Array(levels)
      for (const i of members) {
        let best = 0
        for (let l = 1; l < levels; l++) if (Math.abs(logS.get(i) - centres[l]) < Math.abs(logS.get(i) - centres[best])) best = l
        level.set(i, best)
        sum[best] += logS.get(i) * weight[i]; w[best] += weight[i]
      }
      for (let l = 0; l < levels; l++) if (w[l]) centres[l] = sum[l] / w[l]
    }
    const base = clusters.length
    for (let l = 0; l < levels; l++) clusters.push({ group: c, level: l })
    for (const i of members) clusterOfBin[i] = base + level.get(i)
  }

  const labels = new Int32Array(count)
  for (let p = 0; p < count; p++) labels[p] = clusterOfBin[binOf[p]]
  return { labels, clusters }
}

export function majorityFilter(labels, width, height, k, passes) {
  let src = labels
  const votes = new Int32Array(k)
  for (let pass = 0; pass < passes; pass++) {
    const dst = new Int32Array(src.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        votes.fill(0)
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= width) continue
            votes[src[yy * width + xx]]++
          }
        }
        const own = src[y * width + x]
        let best = own
        for (let c = 0; c < k; c++) if (votes[c] > votes[best]) best = c
        dst[y * width + x] = votes[best] >= 5 ? best : own
      }
    }
    src = dst
  }
  return src
}

/** 4-connected components. Returns region id per pixel and the cluster of each region. */
export function connectedComponents(labels, width, height) {
  const regionMap = new Int32Array(labels.length).fill(-1)
  const regionCluster = []
  const regionSize = []
  const stack = new Int32Array(labels.length)
  for (let start = 0; start < labels.length; start++) {
    if (regionMap[start] !== -1) continue
    const id = regionCluster.length
    const cluster = labels[start]
    let top = 0, size = 0
    stack[top++] = start
    regionMap[start] = id
    while (top) {
      const p = stack[--top]
      size++
      const x = p % width, y = (p - x) / width
      const nbs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]
      for (const q of nbs) {
        if (q >= 0 && regionMap[q] === -1 && labels[q] === cluster) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
    }
    regionCluster.push(cluster)
    regionSize.push(size)
  }
  return { regionMap, regionCluster, regionSize }
}

/** Repeatedly merge regions below minRegion px into their longest-border neighbour's cluster. */
export function mergeSmallRegions(labels, width, height, minRegion) {
  let current = labels
  for (let round = 0; round < 6; round++) {
    const { regionMap, regionCluster, regionSize } = connectedComponents(current, width, height)
    const small = regionSize.map((s) => s < minRegion)
    if (!small.some(Boolean)) return current
    const border = new Map() // smallRegion -> Map(neighbourCluster -> count)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        const r = regionMap[p]
        if (!small[r]) continue
        const nbs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]
        for (const q of nbs) {
          if (q < 0) continue
          const rq = regionMap[q]
          if (rq === r) continue
          if (!border.has(r)) border.set(r, new Map())
          const m = border.get(r)
          // Prefer merging into large neighbours: weight by their size.
          const c = regionCluster[rq]
          m.set(c, (m.get(c) || 0) + (small[rq] ? 0.25 : 1))
        }
      }
    }
    const newCluster = regionCluster.slice()
    for (const [r, m] of border) {
      let best = -1, bestCount = -1
      for (const [c, count] of m) if (count > bestCount) { bestCount = count; best = c }
      if (best >= 0) newCluster[r] = best
    }
    const next = new Int32Array(current.length)
    for (let p = 0; p < next.length; p++) next[p] = newCluster[regionMap[p]]
    current = next
  }
  return current
}

/** Chamfer distance to the region border; the max per region is a good label anchor. */
export function labelAnchors(regionMap, width, height, regionCount) {
  const INF = 1e9
  const dist = new Float32Array(regionMap.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const r = regionMap[p]
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        regionMap[p - 1] !== r || regionMap[p + 1] !== r || regionMap[p - width] !== r || regionMap[p + width] !== r
      dist[p] = edge ? 0 : INF
    }
  }
  const D = 1, D2 = 1.414
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (!dist[p]) continue
      dist[p] = Math.min(dist[p], dist[p - 1] + D, dist[p - width] + D, dist[p - width - 1] + D2, dist[p - width + 1] + D2)
    }
  }
  for (let y = height - 2; y >= 0; y--) {
    for (let x = width - 2; x > 0; x--) {
      const p = y * width + x
      if (!dist[p]) continue
      dist[p] = Math.min(dist[p], dist[p + 1] + D, dist[p + width] + D, dist[p + width + 1] + D2, dist[p + width - 1] + D2)
    }
  }
  const anchors = Array.from({ length: regionCount }, () => ({ x: 0, y: 0, d: -1 }))
  for (let p = 0; p < regionMap.length; p++) {
    const a = anchors[regionMap[p]]
    if (dist[p] > a.d) {
      a.d = dist[p]
      a.x = p % width
      a.y = (p - a.x) / width
    }
  }
  return anchors
}

/**
 * Calm areas from the labels of the clustering, in five steps:
 * 1. pieces of a few pixels join a neighbour, so that a letter or an eye is one area;
 * 2. the details are found: small or thin areas that stand out, but not texture (one of many
 *    small pieces in a rough zone: heather, leaves). They stay as they are from here on;
 * 3. areas join: the ones too small for a brush always, larger ones while it costs little;
 * 4. the outlines are rounded;
 * 5. what the rounding cut off or made too small joins a neighbour.
 * `simplify` (0..10) raises the smallest area, the limits, the least size of a detail and the
 * rounding; the joining goes through every step up to it on the same details, so a higher step
 * joins what the lower one left. Inside `where` (a mask of the focus boxes) the areas are those
 * of Simplify 0, with half the limits. In a zone of texture the smallest area is larger and the
 * outlines are rounder (TEXTURE_STEPS, TEXTURE_ROUNDER), so that heather or a tree becomes a few
 * calm shapes; sizes there scale with the picture like all others.
 * Below 0 (down to FINEST) there is one stage, with the sizes, limits and rounding of Simplify 0
 * taken back evenly; at FINEST only areas under SMALLEST_AREA join and no outline is rounded.
 * @param {Int32Array} raw  cluster per pixel
 * @param {Float32Array} lab  colour per pixel, without noise
 * @param {Float32Array} [photo]  colour per pixel as in the photo: tells texture from details
 * @param {Int32Array} [kindOf]  per cluster, the mix it is a wash of
 * @returns {Int32Array} cluster per pixel
 */
export function calmAreas(raw, lab, width, height, k, simplify, where = null, photo = null, kindOf = null) {
  const count = width * height
  // What is left of the calming below Simplify 0: 1 from 0 on, 0 at FINEST.
  const calm = simplify < 0 ? Math.max(0, 1 - simplify / FINEST) : 1
  const minSizeAt = (level) => Math.max(SMALLEST_AREA, Math.round(MIN_AREA * (count / REFERENCE_PIXELS) * Math.pow(level + 1, MIN_AREA_POWER)))
  const mergeLimitAt = (level) => MERGE_LIMIT * Math.pow(MERGE_GROWTH, level)
  const detailLimitAt = (level) => DETAIL_LIMIT * (1 + DETAIL_RISE * level * level * level)
  const detailSizeAt = (level) => Math.round(DETAIL_SIZE * Math.pow(DETAIL_SIZE_GROWTH, level))
  const radiusAt = (level) => Math.max(1, Math.round((OUTLINE_RADIUS + level * OUTLINE_RADIUS_STEP) * Math.sqrt(count / REFERENCE_PIXELS)))

  // One stage per step of Simplify below the one asked for, then that one (see `mergeAreas`).
  const stageAt = (level) => ({ floor: SMALLEST_AREA, minSize: minSizeAt(level), limit: mergeLimitAt(level), detailLimit: detailLimitAt(level), detailSize: detailSizeAt(level), detailRoom: minSizeAt(level), roughSize: minSizeAt(level + TEXTURE_STEPS) })
  // Below 0: the stage of Simplify 0 with its sizes (by area, hence the square) and limits taken back.
  const fineSizeAt = (level) => Math.max(SMALLEST_AREA, Math.round(minSizeAt(level) * calm * calm))
  const fineStage = () => ({ floor: SMALLEST_AREA, minSize: fineSizeAt(0), limit: mergeLimitAt(0) * calm, detailLimit: detailLimitAt(0) * calm, detailSize: detailSizeAt(0), detailRoom: fineSizeAt(0), roughSize: fineSizeAt(TEXTURE_STEPS * calm) })
  const stages = []
  for (let level = 0; level < simplify; level++) stages.push(stageAt(level))
  const last = simplify < 0 ? fineStage() : stageAt(simplify)
  stages.push(last)
  const inside = simplify < 0
    ? { ...last, limit: last.limit * FOCUS_LIMIT, detailLimit: last.detailLimit * FOCUS_LIMIT, roughSize: undefined }
    : { floor: SMALLEST_AREA, minSize: minSizeAt(0), limit: mergeLimitAt(0) * FOCUS_LIMIT, detailLimit: detailLimitAt(0) * FOCUS_LIMIT, detailSize: detailSizeAt(0), detailRoom: minSizeAt(0) }
  // The window of the rounding; below 0 it shrinks to nothing.
  const windowAt = (level) => (simplify < 0 ? Math.round((OUTLINE_RADIUS + level * OUTLINE_RADIUS_STEP) * calm * Math.sqrt(count / REFERENCE_PIXELS)) : radiusAt(level))

  const tidy = mergeAreas(raw, lab, width, height, [{ floor: SMALLEST_AREA, limit: MERGE_LIMIT * TIDY_LIMIT * calm }])
  // The details are the same at every step (up to the largest that the top step has room for);
  // a step only says which of them it keeps. So the steps join the same areas in the same order.
  const rough = photo ? new Uint8Array(count) : null
  const details = findDetails(tidy, lab, width, height, { minSize: SMALLEST_AREA, maxSize: minSizeAt(Math.max(TOP_SIMPLIFY, simplify)), photo, cell: Math.max(2, Math.round(TEXTURE_CELL * Math.sqrt(count / REFERENCE_PIXELS))), pieceSize: minSizeAt(0), kindOf, textured: rough })
  const joining = { details, where, inside, rough }
  const merged = mergeAreas(tidy, lab, width, height, stages, joining)
  // The details that are left and are small or thin: no outline of theirs is rounded. One as large
  // as an area that stays anyway (a window, a lip) keeps its place but gets a round outline.
  const fixed = new Uint8Array(count)
  for (let p = 0; p < count; p++) {
    const rule = where && where[p] ? inside : last
    fixed[p] = details.worth[p] > 0 && details.worth[p] >= rule.detailLimit && details.span[p] >= rule.detailSize && details.room[p] < minSizeAt(0) ? 1 : 0
  }
  const rounded = roundOutlines(merged, width, height, k, { radius: windowAt(Math.max(0, simplify)), passes: OUTLINE_PASSES, fixed })
  if (rough) {
    // The zones of texture once more, with a wider window; not where a focus box asks for fine areas.
    if (where) for (let p = 0; p < count; p++) if (where[p]) rough[p] = 0
    const wide = roundOutlines(rounded, width, height, k, { radius: windowAt(Math.max(0, simplify) + TEXTURE_ROUNDER * calm), passes: OUTLINE_PASSES, fixed, only: rough })
    for (let p = 0; p < count; p++) rounded[p] = wide[p]
  }
  if (where && simplify > 0) {
    const fine = roundOutlines(merged, width, height, k, { radius: radiusAt(0), passes: OUTLINE_PASSES, fixed, only: where })
    for (let p = 0; p < count; p++) if (where[p]) rounded[p] = fine[p]
  }
  return mergeAreas(rounded, lab, width, height, [last], joining)
}

/**
 * Full pipeline.
 * @param {Uint8ClampedArray} rgba image data at working resolution
 * @param {{colours:number, simplify:number, geometric:boolean}} options colours = number of mixes,
 *   simplify FINEST..10 (0 and up: calm areas, ever fewer; below 0: ever finer, at FINEST the areas
 *   follow the photo), geometric = areas as polygons with straight edges instead of their organic outline,
 *   anchors = hex colours that are the mixes (then `colours` is not used),
 *   focus = boxes [left, top, right, bottom] (0..1) in which the areas stay as fine as at Simplify 0
 *   and details are kept more readily, whatever `simplify` is,
 *   maxWashes / washStep = washes a mix is split into at most, and the factor of strength (log)
 *   between two of them: a grey picture is one mix, so these set the number of its values,
 *   variety = the Details slider 0..10 (see `varietyWeights`), unless areaPower / lightnessWeight are given
 */
export function segmentImage(rgba, width, height, { colours = 12, simplify = 4, geometric = false, anchors: given = null, focus = null, seed = 7, variety = 5, areaPower, maxWashes, washStep, lightnessWeight } = {}) {
  const count = width * height
  const weights = varietyWeights(variety)
  areaPower ??= weights.areaPower
  lightnessWeight ??= weights.lightnessWeight
  // Noise goes before the colours are found: every pixel takes the colour of its patch.
  const original = toOklabPixels(rgba, count)
  // Below Simplify 0 the patches shrink, and with a side under two pixels there are none.
  const calm = simplify < 0 ? Math.max(0, 1 - simplify / FINEST) : 1
  const step = Math.round(PATCH_STEP * calm)
  let lab = original
  if (step >= 2) {
    const patches = compactPatches(original, width, height, step)
    const restless = settlePatches(original, width, height, patches)
    lab = patchColours(original, width, height, patches, { blend: PATCH_BLEND * calm, restless })
  }
  const { labels: raw, clusters: found } = clusterWashes(lab, count, Math.max(1, Math.min(colours, count)), {
    seed, areaPower, maxWashes, washStep, lightnessWeight,
    // Given colours (hex) as the mixes, instead of finding them.
    anchors: given?.length ? given.map(hexToOklab) : null,
  })
  const k = found.length
  const where = focus?.length ? boxMask(focus, width, height) : null
  const calmed = calmAreas(raw, lab, width, height, k, simplify, where, original, Int32Array.from(found, (c) => c.group))
  let labels = calmed
  if (geometric) {
    labels = geometricAreas(calmed, width, height, Math.max(0, simplify))
    if (where) {
      // Where the details are, the areas keep their own outlines; what that cuts off joins a neighbour.
      for (let p = 0; p < count; p++) if (where[p]) labels[p] = calmed[p]
      labels = mergeAreas(labels, lab, width, height, [{ floor: SMALLEST_AREA }])
    }
  }

  // Cluster colours from the pixels of the photo they cover, not from the colours of the patches.
  const sums = new Float64Array(k * 3)
  const counts = new Int32Array(k)
  for (let p = 0; p < count; p++) {
    const c = labels[p]
    sums[c * 3] += original[p * 3]; sums[c * 3 + 1] += original[p * 3 + 1]; sums[c * 3 + 2] += original[p * 3 + 2]
    counts[c]++
  }
  const clusters = found.map(({ group, level }, c) => ({
    index: c,
    group, // the mix this colour is a wash of
    level, // wash within the mix, 0 = lightest
    hex: counts[c] ? oklabToHex([sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]]) : '#ffffff',
    pixelCount: counts[c],
  }))

  const { regionMap, regionCluster, regionSize } = connectedComponents(labels, width, height)
  const anchors = labelAnchors(regionMap, width, height, regionCluster.length)
  const regions = regionCluster.map((cluster, id) => ({
    id,
    cluster,
    size: regionSize[id],
    anchorX: anchors[id].x,
    anchorY: anchors[id].y,
    anchorDist: anchors[id].d,
  }))

  // Clusters can end up empty after merging; callers skip those (pixelCount === 0).
  return { width, height, regionMap, regions, clusters }
}
