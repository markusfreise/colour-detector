// Layer mode (glazing): the picture as transparent layers painted over each other, light to dark.
//
// Mix mode mixes every colour on the palette and paints each area once. Layer mode uses what only
// watercolour does: a dried wash is a filter, and a second wash over it filters the light again.
// So the absorbances of separate layers add up, and a few base paints reach the secondary colours
// (yellow over blue is a green) and the darks without any mixing.
//
// Model:
// - A WASH layer is one base paint, painted with ONE prepared wash (its strength = paint to
//   water). Every area gets 0..maxCoats coats of it. Coats are nested: coat 2 lies inside coat 1.
// - An ACCENT layer is one strong wash, painted once, on the small parts the broad washes cannot
//   reach: the darkest folds, a small area of another hue. It is fitted to what the washes leave
//   over and painted last. Its paint may be one of the wash paints or a paint of its own.
// - The colour of an area is white paper filtered by every layer:
//   reflectance = exp(-sum over layers of depth * A of the paint).
//   Different paints add up without a common limit, which is what a wet mix cannot do. The coats of
//   ONE paint share that paint's limit, depth = depth(coats * strength, limit): three coats of
//   yellow come closer to the yellow's masstone, they do not turn into an orange. An accent of a
//   paint that is also a wash adds what is left up to that limit.
// - Work has a price. Every coat must make the colour it is painted on visibly better, every step
//   (one wash over the dried picture) must make the picture better, and an accent must make its
//   small part much better. What does not pay is left out: a layer can end up with one coat, and
//   fewer paints than asked for are proposed when the rest would only be tints nobody sees.
// - Option `graded`: every coat of a wash layer may be a stronger wash than the one before.
//   Measured on the sample pictures this brings the colours about a tenth closer and is not
//   visible once the areas are smoothed, for up to maxCoats washes to prepare per paint instead
//   of one. So one wash per paint is the default.
//
// Fitting works on the colours of the picture (histogram bins), not on its pixels: which paints,
// how strong each wash, and how many coats of each wash every colour gets. The picture comes in
// afterwards: one map of coat counts per layer, each smoothed on its own so that every layer has
// calm shapes to paint.
//
// Pure functions on typed arrays so it runs in a Web Worker and in tests.

import { hexToRgb, rgbToLinear, linearToSrgb, rgbToHex } from './color.js'
import { absorbanceFromHex, depthLimit, depth, describeDilution } from './mixing.js'
import { boxBlur, toOklabPixels, colourBins, majorityFilter, connectedComponents, mergeSmallRegions, labelAnchors } from './segment.js'

/** Coats per wash layer when nothing else is asked for. */
export const MAX_COATS = 3
/** More paints than this are not fitted: every combination of coats is looked at. */
export const MAX_LAYERS = 7
/**
 * Parts of water to one part of paint (as it comes from the tube, or a pan worked up to that
 * consistency) that are taken to give strength 1, the paint's swatch. An assumption, not a
 * measurement: swatch a few washes and adjust it.
 */
export const REFERENCE_WATER = 4
// Combinations of coats of all layers that are still looked at one by one.
const MAX_COMBINATIONS = 40000
// Whether the coats of a layer may differ in strength when nothing else is asked for.
const GRADED = false
// Wash strengths tried when the paints are chosen; the strengths are tuned freely afterwards.
const STRENGTHS = [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.4]
const ACCENT_STRENGTHS = [0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.4]
const MIN_STRENGTH = 0.05
const MAX_STRENGTH = 4
// Graded coats: every coat this many times stronger than the one before (1 = the same wash again).
const RATIOS = [1, 1.7, 3]
const MAX_RATIO = 4
// The fit runs on at most about this many colours, however colourful the picture is.
const FIT_COLOURS = 220
// The paints are proposed from the picture with this blur, whatever `simplify` is: the proposal
// should not change when only the size of the areas does.
const PROPOSAL_BLUR = 1
// While paints and washes are tried out, every colour only looks at its few best combinations of
// the other layers instead of at all of them.
const SHORTLIST = 5
// How often the chosen paints are gone through to exchange one for a better one.
const SWAP_ROUNDS = 3
// The price of work, in deltaE. A coat must bring the colour it is painted on this much closer:
// between two combinations that look alike, the one with fewer coats wins, and one strong wash
// beats two weak ones.
const COAT_PRICE = 0.3
// A step (one wash over the dried picture, with its drying time) must bring the mean distance of
// the whole picture down by this much, or the layer does without that coat.
const STEP_PRICE = 0.25
// An accent is only put where it brings the colour this much closer: a few clear shapes, not a
// tint over half the picture.
const ACCENT_COAT_PRICE = 3
// Rounds in which the areas of the smoothed layers are fitted to each other.
const REVISIONS = 2
// The smallest area of an accent, as a part of the smallest area of a wash layer: accents are
// there for the small things.
const ACCENT_REGION = 0.15

// Spots (wash result and picture colour) the accents are chosen on: the worst ones.
const ACCENT_SPOTS = 1500
// A spot gets an accent together with other washes than its surroundings (a shape left out of a
// wash) only when that is closer by this much than the accent over the washes as they are.
const CARVE_GAIN = 3
// An accent covers at most this part of the picture.
const ACCENT_SHARE = 0.2

// What `variety` 0..10 stands for: how many accents there may be and how readily one is used.
// Accents are chosen by the squared distance they take away, so that one bad miss counts for more
// than many small ones, with the weight of a colour = (its pixel count) ^ detailPower, so that
// small parts count for more than their area. An accent is used when it lowers the mean squared
// distance weighted like that by `price`; `spare` places among the paints are kept free for
// accents of another paint than the washes.
function varietyOf(variety) {
  const v = Math.min(10, Math.max(0, variety))
  return {
    accents: v <= 0 ? 0 : v < 4 ? 1 : v < 8 ? 2 : 3,
    detailPower: 1 - 0.07 * v,
    price: 2 * Math.pow(0.75, v),
    spare: v < 3 ? 0 : 1,
  }
}

// OKLab of a linear RGB colour, written into out[o..o+2] (no allocation in the inner loops).
function writeLab(r, g, b, out, o) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

const linearHex = (lin, o = 0) => rgbToHex([linearToSrgb(lin[o]), linearToSrgb(lin[o + 1]), linearToSrgb(lin[o + 2])])

/** Amount of paint in `coats` coats: the first of the given strength, every further one `ratio` times stronger. */
export function coatAmount(coats, strength, ratio = 1) {
  return Math.abs(ratio - 1) < 1e-6 ? coats * strength : (strength * (Math.pow(ratio, coats) - 1)) / (ratio - 1)
}

/** Depth a paint reaches with that many coats. The coats of one paint share the paint's limit. */
export function coatDepth(coats, strength, limit, ratio = 1) {
  return depth(coatAmount(coats, strength, ratio), limit)
}

/**
 * How to prepare a wash of the given strength: parts of water to one part of paint, rounded as
 * roughly as anyone can measure with a brush, and the consistency painters name it by.
 * @returns {{water: number, consistency: string, guide: string}}
 *   guide = the two in words, e.g. "1 part paint to 20 parts water, like tea"
 */
export function washGuide(strength) {
  if (!(strength > 0)) return { water: Infinity, consistency: 'water', guide: 'clear water' }
  const exact = REFERENCE_WATER / strength
  const step = exact < 3 ? 0.5 : exact < 10 ? 1 : exact < 30 ? 5 : exact < 100 ? 10 : 50
  const water = Math.round(exact / step) * step
  const consistency = water >= 20 ? 'tea' : water >= 8 ? 'coffee' : water >= 3 ? 'milk' : water > 1 ? 'cream' : 'butter'
  const parts = water < 1 ? 'hardly any water' : `${water} ${water === 1 ? 'part' : 'parts'} water`
  return { water, consistency, guide: `1 part paint to ${parts}, like ${consistency}` }
}

// What a layer does to the light, per number of coats: (top + 1) x 3 factors on linear RGB.
// `under` = amount of the same paint already on the paper (an accent over its own wash layer).
function filterTable(A, limit, strength, ratio, top, under = 0) {
  const t = new Float64Array((top + 1) * 3)
  const below = depth(under, limit)
  for (let c = 0; c <= top; c++) {
    const d = depth(under + coatAmount(c, strength, ratio), limit) - below
    t[c * 3] = Math.exp(-d * A[0]); t[c * 3 + 1] = Math.exp(-d * A[1]); t[c * 3 + 2] = Math.exp(-d * A[2])
  }
  return t
}

// Every combination of coats of the given layers on white paper: linear RGB, OKLab and the work
// in it (the price of its coats, as OKLab distance). `prices[k]` = price of a coat of layer k.
// Combination index = coats of layer 0 + levels of layer 0 * (coats of layer 1 + ...).
function combinations(tables, prices) {
  let lin = new Float64Array([1, 1, 1])
  let work = new Float64Array(1)
  tables.forEach((t, k) => {
    const levels = t.length / 3, n = lin.length / 3
    const next = new Float64Array(n * levels * 3)
    const more = new Float64Array(n * levels)
    for (let c = 0; c < levels; c++) {
      for (let i = 0; i < n; i++) {
        const o = (c * n + i) * 3
        next[o] = lin[i * 3] * t[c * 3]; next[o + 1] = lin[i * 3 + 1] * t[c * 3 + 1]; next[o + 2] = lin[i * 3 + 2] * t[c * 3 + 2]
        more[c * n + i] = work[i] + (c * prices[k]) / 100
      }
    }
    lin = next
    work = more
  })
  const size = lin.length / 3
  const lab = new Float64Array(size * 3)
  for (let i = 0; i < size; i++) writeLab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2], lab, i * 3)
  return { lin, lab, work, size }
}

/**
 * The best combination for every colour: the closest one, its work counting as distance.
 * @returns {{best: Int32Array, error: Float64Array}} combination index and deltaE per colour
 */
function closest(combos, points, n) {
  const best = new Int32Array(n)
  const error = new Float64Array(n)
  const { lab, work, size } = combos
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    let least = Infinity, least2 = Infinity, bi = 0, bd = 0
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d2 = dL * dL + da * da + db * db
      if (d2 >= least2) continue
      const d = Math.sqrt(d2)
      if (d + work[p] < least) { least = d + work[p]; least2 = least * least; bi = p; bd = d }
    }
    best[i] = bi
    error[i] = bd * 100
  }
  return { best, error }
}

// For every colour its `keep` best combinations of the given layers, as linear RGB and with the
// work already in them: what the other layers can offer a new layer to work on.
function shortlist(tables, prices, points, n, keep) {
  const combos = combinations(tables, prices)
  const T = Math.min(keep, combos.size)
  const { lab, lin, size } = combos
  const base = new Float64Array(n * T * 3)
  const work = new Float64Array(n * T)
  const topD = new Float64Array(T), topI = new Int32Array(T)
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    topD.fill(Infinity)
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d = Math.sqrt(dL * dL + da * da + db * db) + combos.work[p]
      if (d < topD[T - 1]) {
        let s = T - 1
        while (s > 0 && topD[s - 1] > d) { topD[s] = topD[s - 1]; topI[s] = topI[s - 1]; s-- }
        topD[s] = d; topI[s] = p
      }
    }
    for (let s = 0; s < T; s++) {
      const o = (i * T + s) * 3, p = topI[s] * 3
      base[o] = lin[p]; base[o + 1] = lin[p + 1]; base[o + 2] = lin[p + 2]
      work[i * T + s] = combos.work[topI[s]]
    }
  }
  return { base, work, T }
}

// Weighted mean of distance plus work of the colours when one more layer is laid over their
// shortlisted combinations. Gives up as soon as the sum passes `bound` (the best so far).
const scratch = new Float64Array(3)
function errorWith(table, { base, work, T }, points, weights, n, bound = Infinity) {
  const levels = table.length / 3
  const coat = COAT_PRICE / 100
  let sum = 0
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    let least = Infinity
    for (let s = 0; s < T; s++) {
      const o = (i * T + s) * 3
      for (let c = 0; c < levels; c++) {
        writeLab(base[o] * table[c * 3], base[o + 1] * table[c * 3 + 1], base[o + 2] * table[c * 3 + 2], scratch, 0)
        const dL = scratch[0] - L, da = scratch[1] - a, db = scratch[2] - b
        const d = Math.sqrt(dL * dL + da * da + db * db) + work[i * T + s] + coat * c
        if (d < least) least = d
      }
    }
    sum += weights[i] * least
    if (sum > bound) return Infinity
  }
  return sum
}

/**
 * A set of colours to fit layers to.
 * @param {Array<{hex:string, weight?:number}>} colours  weight = e.g. the pixel count, default 1
 * @returns {{points: Float64Array, counts: Float64Array}} OKLab triples and weights, like `colourBins`
 */
export function colourSet(colours) {
  const points = new Float64Array(colours.length * 3)
  const counts = new Float64Array(colours.length)
  colours.forEach((c, i) => {
    const [r, g, b] = rgbToLinear(hexToRgb(c.hex))
    writeLab(r, g, b, points, i * 3)
    counts[i] = c.weight ?? 1
  })
  return { points, counts }
}

/**
 * The colours of a picture, for `proposeLayerPaints`. Always taken with the same slight blur, so
 * that the proposal does not depend on `simplify`.
 * @param {Uint8ClampedArray} rgba  image data at working resolution
 * @returns {{points: Float64Array, counts: Float64Array}}
 */
export function pictureColours(rgba, width, height) {
  const count = width * height
  const { points, counts } = colourBins(toOklabPixels(boxBlur(rgba, width, height, PROPOSAL_BLUR), count), count)
  return { points, counts }
}

// The colours the fit works on: the given ones, joined on a coarser grid until few enough are
// left, sorted by weight so that a bad candidate is given up early.
function fitSet({ points, counts }) {
  const total = counts.length
  let n = total, pts = points, cnt = counts
  for (let stepL = 0.03, stepAB = 0.015; n > FIT_COLOURS; stepL *= 1.3, stepAB *= 1.3) {
    const joined = joinColours(points, counts, stepL, stepAB)
    n = joined.counts.length; pts = joined.points; cnt = joined.counts
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => cnt[y] - cnt[x] || x - y)
  const outPts = new Float64Array(n * 3), weights = new Float64Array(n)
  let sum = 0
  order.forEach((i, j) => {
    outPts[j * 3] = pts[i * 3]; outPts[j * 3 + 1] = pts[i * 3 + 1]; outPts[j * 3 + 2] = pts[i * 3 + 2]
    weights[j] = cnt[i]
    sum += weights[j]
  })
  // Weights add up to 100, so the error of a set of layers reads as a weighted mean deltaE.
  for (let j = 0; j < n; j++) weights[j] *= 100 / sum
  return { points: outPts, weights, n }
}

// Colours joined on a grid in OKLab: per occupied cell the mean colour and the summed count;
// `cellOf` = the cell of every colour that came in.
function joinColours(points, counts, stepL, stepAB) {
  const total = counts.length
  const index = new Map()
  const sums = []
  const cellOf = new Int32Array(total)
  for (let i = 0; i < total; i++) {
    const key = Math.round(points[i * 3] / stepL) * 1048576 + (Math.round(points[i * 3 + 1] / stepAB) + 512) * 1024 + Math.round(points[i * 3 + 2] / stepAB) + 512
    let j = index.get(key)
    if (j === undefined) { j = sums.length / 4; index.set(key, j); sums.push(0, 0, 0, 0) }
    sums[j * 4] += points[i * 3] * counts[i]; sums[j * 4 + 1] += points[i * 3 + 1] * counts[i]; sums[j * 4 + 2] += points[i * 3 + 2] * counts[i]
    sums[j * 4 + 3] += counts[i]
    cellOf[i] = j
  }
  const n = sums.length / 4
  const pts = new Float64Array(n * 3), cnt = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    cnt[j] = sums[j * 4 + 3]
    pts[j * 3] = sums[j * 4] / cnt[j]; pts[j * 3 + 1] = sums[j * 4 + 1] / cnt[j]; pts[j * 3 + 2] = sums[j * 4 + 2] / cnt[j]
  }
  return { points: pts, counts: cnt, cellOf }
}

const NO_LAYER = new Float64Array([1, 1, 1])

// Amount of an accent's paint that its wash layer has already put on the paper (all its coats).
function underOf(layer, chosen) {
  if (layer.kind !== 'accent') return 0
  const wash = chosen.find((l) => l.kind === 'wash' && l.paint === layer.paint)
  return wash ? coatAmount(wash.top, wash.strength, wash.ratio) : 0
}

const tablesOf = (chosen) => chosen.map((layer) => filterTable(layer.A, layer.limit, layer.strength, layer.ratio, layer.top, underOf(layer, chosen)))
const pricesOf = (chosen) => chosen.map((layer) => (layer.kind === 'accent' ? ACCENT_COAT_PRICE : COAT_PRICE))
const paintsOf = (chosen) => new Set(chosen.map((layer) => layer.paint))

// Plan the wash layers: which paints, with how many coats of which wash.
// The search can get stuck, and graded coats give it more room to do so: with `graded` it runs
// once with even coats and once with graded ones, and the cheaper plan (distance plus work) counts.
function planWashes(set, paints, options) {
  const maxRatio = options.graded && options.maxCoats > 1 ? MAX_RATIO : 1
  let best = null
  for (const ratios of maxRatio > 1 && !options.start ? [[1], RATIOS] : [maxRatio > 1 ? RATIOS : [1]]) {
    const chosen = searchWashes(set, paints, { ...options, ratios, maxRatio })
    const combos = combinations(tablesOf(chosen), pricesOf(chosen))
    const { best: combo, error } = closest(combos, set.points, set.n)
    let sum = chosen.reduce((steps, layer) => steps + layer.top, 0) * STEP_PRICE
    for (let i = 0; i < set.n; i++) sum += (set.weights[i] / 100) * (error[i] + combos.work[combo[i]] * 100)
    if (!best || sum < best.sum - 1e-9) best = { chosen, sum }
  }
  return best.chosen
}

// One run of the search: add the paint that pays most, one at a time, as long as one pays;
// exchange every chosen paint for a better one as long as that helps; tune strength and number of
// coats of every layer and drop what no longer pays. `start` = wash layers to go on from.
function searchWashes(set, paints, { count, maxCoats, ratios, maxRatio, start }) {
  const { points, weights, n } = set
  const grid = []
  for (const ratio of ratios) {
    for (const strength of STRENGTHS) if (strength * Math.pow(ratio, maxCoats - 1) <= MAX_STRENGTH) grid.push({ strength, ratio })
  }
  const pool = paints.map((paint) => {
    const A = absorbanceFromHex(paint.hex)
    const limit = depthLimit(A)
    return { paint, A, limit, tables: grid.map((w) => filterTable(A, limit, w.strength, w.ratio, maxCoats)) }
  })
  const wanted = Math.min(count, pool.length, MAX_LAYERS)
  let chosen = start ? start.map((layer) => ({ ...layer })) : []
  const others = (skip) => {
    const rest = chosen.filter((_, i) => i !== skip)
    return shortlist(tablesOf(rest), pricesOf(rest), points, n, SHORTLIST)
  }

  // The best paint, wash and number of coats for the layer at `skip` (or for a new one).
  // `bound` = distance plus work that it has to beat, the steps of the layer included.
  const bestWash = (skip, rest, bound) => {
    let best = null
    for (const candidate of pool) {
      if (chosen.some((layer, i) => i !== skip && layer.paint === candidate.paint)) continue
      for (let g = 0; g < grid.length; g++) {
        for (let top = grid[g].ratio === 1 ? 1 : 2; top <= maxCoats; top++) {
          const steps = STEP_PRICE * top
          const cost = errorWith(candidate.tables[g].subarray(0, (top + 1) * 3), rest, points, weights, n, bound - steps) + steps
          if (cost < bound) { bound = cost; best = { paint: candidate.paint, A: candidate.A, limit: candidate.limit, ...grid[g], top, kind: 'wash' } }
        }
      }
    }
    return best
  }
  const add = () => {
    let added = false
    while (chosen.length < wanted) {
      // Every combination of coats is looked at later: no more layers than that can take.
      if (chosen.reduce((size, layer) => size * (layer.top + 1), maxCoats + 1) > MAX_COMBINATIONS / 4) break
      const rest = others(-1)
      const next = bestWash(-1, rest, errorWith(NO_LAYER, rest, points, weights, n) - 1e-6)
      if (!next) break
      chosen.push(next)
      added = true
    }
    return added
  }
  const exchange = () => {
    let improved = false
    for (let round = 0; round < SWAP_ROUNDS; round++) {
      let better = false
      for (let k = 0; k < chosen.length; k++) {
        const rest = others(k)
        const now = errorWith(tablesOf(chosen)[k], rest, points, weights, n) + STEP_PRICE * chosen[k].top
        const next = bestWash(k, rest, now - 0.005)
        if (next) { chosen[k] = next; better = improved = true }
      }
      if (!better) break
    }
    return improved
  }

  const clamp = (s, r, top) => {
    const ratio = top > 1 ? Math.min(maxRatio, Math.max(1, r)) : 1
    return [Math.min(MAX_STRENGTH / Math.pow(ratio, top - 1), Math.max(MIN_STRENGTH, s)), ratio]
  }
  // Pattern search on the water level of the first coat and on how much stronger the next coats are.
  const tuneWash = (errorAt, start, top) => {
    let at = clamp(start[0], start[1], top), best = errorAt(at)
    for (let step = 0.3; step > 0.01; step /= 2) {
      for (let moved = true; moved; ) {
        moved = false
        for (const [ds, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
          if (dr && (maxRatio === 1 || top === 1)) continue
          const trial = clamp(at[0] * Math.exp(ds * step), at[1] * Math.exp(dr * step), top)
          const e = errorAt(trial)
          if (e < best - 1e-9) { best = e; at = trial; moved = true; break }
        }
      }
    }
    return { at, error: best }
  }
  // Every layer in turn, with the others fixed: its wash, its number of coats, and whether it
  // still pays at all.
  const tune = () => {
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < chosen.length; k++) {
        const layer = chosen[k]
        const rest = others(k)
        const errorAt = (top) => ([s, r]) => errorWith(filterTable(layer.A, layer.limit, s, r, top), rest, points, weights, n) + STEP_PRICE * top
        let top = layer.top
        let best = tuneWash(errorAt(top), [layer.strength, layer.ratio], top)
        for (let other = 1; other <= maxCoats; other++) {
          if (other === layer.top) continue
          // The same amount of paint in fewer or more coats is where to start.
          const trial = tuneWash(errorAt(other), [(layer.strength * layer.top) / other, layer.ratio], other)
          if (trial.error < best.error - 1e-6) { best = trial; top = other }
        }
        if (errorWith(NO_LAYER, rest, points, weights, n) - best.error < 1e-6) top = 0
        layer.strength = best.at[0]; layer.ratio = best.at[1]; layer.top = top
      }
      chosen = chosen.filter((layer) => layer.top > 0)
    }
  }

  if (add() || !start) {
    if (!start) exchange()
    tune()
    if (!start && exchange()) tune()
  }
  return chosen
}

// What the washes leave over, as the accents see it: `base` = linear RGB of what the washes give
// at a spot, `points` = OKLab of what the picture has there, `counts` = how much of the picture
// that is. Only the spots an accent could be worth its while on are kept (missed by more than an
// accent costs), the worst first; `weights` (area) and `detail` are shares of the whole picture.
function residual({ base, points, counts }, detailPower) {
  const all = counts.length
  let total = 0, totalDetail = 0
  for (let i = 0; i < all; i++) { total += counts[i]; totalDetail += Math.pow(counts[i], detailPower) }
  const lab = new Float64Array(3)
  const kept = []
  for (let i = 0; i < all; i++) {
    writeLab(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], lab, 0)
    const miss = Math.hypot(lab[0] - points[i * 3], lab[1] - points[i * 3 + 1], lab[2] - points[i * 3 + 2])
    if (miss * 100 <= ACCENT_COAT_PRICE) continue
    kept.push({ i, rank: Math.pow(counts[i], detailPower) * miss * miss })
  }
  kept.sort((x, y) => y.rank - x.rank || x.i - y.i)
  const n = Math.min(kept.length, ACCENT_SPOTS)
  const out = { n, base: new Float64Array(n * 3), points: new Float64Array(n * 3), weights: new Float64Array(n), detail: new Float64Array(n) }
  for (let j = 0; j < n; j++) {
    const i = kept[j].i
    for (let c = 0; c < 3; c++) { out.base[j * 3 + c] = base[i * 3 + c]; out.points[j * 3 + c] = points[i * 3 + c] }
    out.weights[j] = (counts[i] / total) * 100
    out.detail[j] = (Math.pow(counts[i], detailPower) / totalDetail) * 100
  }
  return out
}

// What an accent is good for on what the washes leave over: the squared distance (its work
// included) it takes away, weighted by `detail`, and the part of the picture (of 100) it would be
// painted on. With `apply` the spots it is painted on get it.
function accentGain(table, spots, apply = false) {
  const { base, points, weights, detail, n } = spots
  const coat = ACCENT_COAT_PRICE / 100
  let gain = 0, share = 0
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const L = points[o], a = points[o + 1], b = points[o + 2]
    writeLab(base[o], base[o + 1], base[o + 2], scratch, 0)
    const without = Math.hypot(scratch[0] - L, scratch[1] - a, scratch[2] - b)
    writeLab(base[o] * table[3], base[o + 1] * table[4], base[o + 2] * table[5], scratch, 0)
    const withIt = Math.hypot(scratch[0] - L, scratch[1] - a, scratch[2] - b) + coat
    if (withIt >= without) continue
    gain += detail[i] * (without * without - withIt * withIt) * 100
    share += weights[i]
    if (apply) { base[o] *= table[3]; base[o + 1] *= table[4]; base[o + 2] *= table[5] }
  }
  return { gain, share }
}

// The accents: one strong wash at a time, of the paint and strength that take most away from what
// is left over, as long as one pays. A paint the washes do not use needs a free place among the
// `maxPaints` paints.
function chooseAccents(washes, spots, paints, { accents, price, maxPaints }) {
  const chosen = []
  const used = paintsOf(washes)
  const pool = paints.map((paint) => {
    const A = absorbanceFromHex(paint.hex)
    const wash = washes.find((layer) => layer.paint === paint)
    return { paint, A, limit: depthLimit(A), under: wash ? coatAmount(wash.top, wash.strength, wash.ratio) : 0 }
  })
  const gainOf = (candidate, strength) => {
    const { gain, share } = accentGain(filterTable(candidate.A, candidate.limit, strength, 1, 1, candidate.under), spots)
    return share > ACCENT_SHARE * 100 ? 0 : gain
  }
  let size = washes.reduce((s, layer) => s * (layer.top + 1), 1)
  for (; chosen.length < accents && spots.n && size * 2 <= MAX_COMBINATIONS; size *= 2) {
    let best = null, most = price
    for (const candidate of pool) {
      if (chosen.some((layer) => layer.paint === candidate.paint)) continue
      if (!used.has(candidate.paint) && used.size >= maxPaints) continue
      for (const strength of ACCENT_STRENGTHS) {
        const gain = gainOf(candidate, strength)
        if (gain > most) { most = gain; best = { candidate, strength } }
      }
    }
    if (!best) break
    // The strength between the ones tried that takes most away.
    let { candidate, strength } = best
    for (let step = 0.25; step > 0.02; step /= 2) {
      for (const dir of [1, -1]) {
        const trial = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength * Math.exp(dir * step)))
        const gain = gainOf(candidate, trial)
        if (gain > most) { most = gain; strength = trial }
      }
    }
    accentGain(filterTable(candidate.A, candidate.limit, strength, 1, 1, candidate.under), spots, true)
    chosen.push({ paint: candidate.paint, A: candidate.A, limit: candidate.limit, strength, ratio: 1, top: 1, kind: 'accent' })
    used.add(candidate.paint)
  }
  return chosen
}

// The whole plan: washes, then accents for what they leave over, then washes again for the places
// among the paints that were kept free for accents and not taken.
// `left(washes)` gives what the washes leave over (see `residual`).
function planLayers(set, left, paints, { count, maxCoats, graded, variety }) {
  const v = varietyOf(variety)
  const maxPaints = Math.min(count, paints.length, MAX_LAYERS)
  // With few paints every one is needed for the washes; from four on a place is kept for accents.
  const spare = v.accents && maxPaints >= 4 ? v.spare : 0
  let washes = planWashes(set, paints, { count: maxPaints - spare, maxCoats, graded })
  const accents = v.accents ? chooseAccents(washes, residual(left(washes), v.detailPower), paints, { accents: v.accents, price: v.price, maxPaints }) : []
  const free = maxPaints - paintsOf([...washes, ...accents]).size
  if (spare && free > 0) washes = planWashes(set, paints, { count: washes.length + free, maxCoats, graded, start: washes })
  return [...washes, ...accents]
}

// What the washes leave over when every colour gets the combination that suits it best.
function leftOfColours({ points, counts }) {
  return (washes) => {
    const combos = combinations(tablesOf(washes), pricesOf(washes))
    const { best } = closest(combos, points, counts.length)
    const base = new Float64Array(counts.length * 3)
    for (let i = 0; i < counts.length; i++) base.set(combos.lin.subarray(best[i] * 3, best[i] * 3 + 3), i * 3)
    return { base, points, counts }
  }
}

// Painting order: the washes, lightest first (OKLab lightness of the layer with all its coats on),
// then the accents, lightest first.
function paintingOrder(chosen) {
  const lab = new Float64Array(3)
  const tables = tablesOf(chosen)
  return chosen
    .map((layer, i) => {
      const o = layer.top * 3
      writeLab(tables[i][o], tables[i][o + 1], tables[i][o + 2], lab, 0)
      return { layer, table: tables[i], under: underOf(layer, chosen), accent: layer.kind === 'accent' ? 1 : 0, L: lab[0], i }
    })
    .sort((x, y) => x.accent - y.accent || y.L - x.L || x.i - y.i)
}

// The layers as they are handed out, and their filter tables with the coats each layer really
// has. The arrays that are handed out all run to maxCoats (the last coat repeated), so that every
// layer can be asked for any number of coats. Paints without a layer are listed last, unused.
function describeLayers(chosen, unused, maxCoats) {
  const ordered = paintingOrder(chosen)
  for (const paint of unused) ordered.push({ layer: { paint, strength: 0, ratio: 1, top: 0, kind: 'wash', limit: 1 }, table: NO_LAYER, under: 0 })
  const layers = ordered.map(({ layer, table, under }, index) => {
    const filters = new Float64Array((maxCoats + 1) * 3)
    for (let c = 0; c <= maxCoats; c++) filters.set(table.subarray(Math.min(c, layer.top) * 3, Math.min(c, layer.top) * 3 + 3), c * 3)
    const washAt = (c) => {
      const strength = layer.strength * Math.pow(layer.ratio, Math.min(c, Math.max(0, layer.top - 1)))
      return { strength, dilution: describeDilution(strength), ...washGuide(strength) }
    }
    return {
      index,
      kind: layer.kind,
      paintId: layer.paint.id,
      top: layer.top,
      ...washAt(0),
      ratio: layer.ratio,
      washes: Array.from({ length: maxCoats }, (_, c) => washAt(c)),
      depths: Array.from({ length: maxCoats + 1 }, (_, c) => depth(under + coatAmount(Math.min(c, layer.top), layer.strength, layer.ratio), layer.limit) - depth(under, layer.limit)),
      hexes: Array.from({ length: maxCoats + 1 }, (_, c) => linearHex(filters, c * 3)),
      filters,
    }
  })
  return { layers, tables: ordered.map((o) => o.table), prices: pricesOf(ordered.map((o) => o.layer)) }
}

// From the colours to the layers, in painting order. `left` as in `planLayers`; without it the
// accents are fitted to the same colours as the washes.
function layersFor(colours, paints, { count, maxCoats, graded, variety, keepUnused, left }) {
  if (!paints.length || !colours.counts.length) return describeLayers([], keepUnused ? paints : [], maxCoats)
  const chosen = planLayers(fitSet(colours), left ?? leftOfColours(colours), paints, { count, maxCoats, graded, variety })
  return describeLayers(chosen, keepUnused ? paints.filter((p) => !chosen.some((l) => l.paint === p)) : [], maxCoats)
}

// Coats of every layer in a combination (see `combinations`).
function coatsOf(combo, tables) {
  return tables.map((t) => { const levels = t.length / 3, c = combo % levels; combo = (combo - c) / levels; return c })
}

const unique = (list) => [...new Set(list)]

/**
 * Propose the base paints for a set of colours.
 * @param {{points: Float64Array, counts: Float64Array}} colours  from `pictureColours` or `colourSet`
 * @param {Array<{id:string, hex:string}>} paints  paints to choose from
 * @param {{count?: number, maxCoats?: number, graded?: boolean, variety?: number}} options
 *   count = the most paints to propose; fewer come back when the rest would not pay for its work.
 *   graded = coats of a layer may get stronger from coat to coat.
 *   variety 0..10 = how much the small parts of the picture count: at 0 only the broad washes are
 *   planned, from there on accents (1, from 4 on 2, from 8 on 3) for the darkest parts and for
 *   small areas of another hue, which pay the sooner the higher it is. 5 is the default.
 *   From the colours alone the accents can only be guessed; `layerImage` proposes from the picture.
 * @returns {string[]} paint ids in painting order: washes light to dark, then paints only used for accents
 */
export function proposeLayerPaints(colours, paints, { count = 4, maxCoats = MAX_COATS, graded = GRADED, variety = 5 } = {}) {
  return unique(layersFor(colours, paints, { count, maxCoats: Math.max(1, maxCoats), graded, variety }).layers.map((layer) => layer.paintId))
}

/**
 * @typedef {Object} Layer
 * @property {number} index        place in the painting order, 0 = first
 * @property {'wash'|'accent'} kind  wash = broad, up to maxCoats coats; accent = one strong coat on small parts, painted after all washes
 * @property {string} paintId
 * @property {number} top          coats this layer has: 1..maxCoats for a wash, 1 for an accent, 0 = the paint is not used
 * @property {number} strength     the wash: amount of paint, 1 = as strong as the paint's swatch
 * @property {string} dilution     the wash in words (`describeDilution`)
 * @property {number} water        parts of water to one part of paint, roughly (`washGuide`)
 * @property {string} consistency  tea, coffee, milk, cream or butter
 * @property {string} guide        the two in words, to print next to the wash
 * @property {number} ratio        1 = every coat is the same wash; graded: coat c + 1 is this much stronger than coat c
 * @property {Array<{strength:number, dilution:string, water:number, consistency:string, guide:string}>} washes  the wash of coat 1..maxCoats (all the same unless graded)
 * @property {number[]} depths     depth after 0..maxCoats coats (coats above `top` repeat the last one)
 * @property {string[]} hexes      colour of 0..maxCoats coats on white paper; hexes[0] is the paper, hexes[1] one stroke of the wash
 * @property {Float64Array} filters  (maxCoats + 1) x 3 factors on linear RGB, for `compositeColours`
 */

/**
 * Fit the layers of the given paints to colours: which paint is a wash (and its wash and coats),
 * which an accent, which is not needed.
 * @param {{points: Float64Array, counts: Float64Array}} colours  from `colourSet` (or `colourBins`)
 * @param {Array<{id:string, hex:string}>} paints  the base paints
 * @param {{maxCoats?: number, graded?: boolean, variety?: number}} options  see `proposeLayerPaints`
 * @returns {{layers: Layer[], coats: number[][], hexes: string[], deltaE: number[], error: number}}
 *   layers = in painting order, paints that are not used last (top 0); a paint can have two
 *   layers, a wash and an accent. coats[i][k] = coats of layer k for colour i; hexes[i] = the
 *   colour those coats give; deltaE[i] = its distance to colour i; error = mean deltaE weighted by count
 */
export function fitLayers(colours, paints, { maxCoats = MAX_COATS, graded = GRADED, variety = 5 } = {}) {
  const n = colours.counts.length
  const { layers, tables, prices } = layersFor(colours, paints, { count: paints.length, maxCoats: Math.max(1, maxCoats), graded, variety, keepUnused: true })
  const combos = combinations(tables, prices)
  const { best, error } = closest(combos, colours.points, n)
  let sum = 0, total = 0
  for (let i = 0; i < n; i++) { sum += error[i] * colours.counts[i]; total += colours.counts[i] }
  return {
    layers,
    coats: Array.from(best, (combo) => coatsOf(combo, tables)),
    hexes: Array.from(best, (combo) => linearHex(combos.lin, combo * 3)),
    deltaE: Array.from(error),
    error: total ? sum / total : 0,
  }
}

/**
 * Colours of coat combinations with only some of the layers switched on (cheap: no fitting, a few
 * multiplications per combination).
 * @param {Layer[]} layers
 * @param {Array<{coats:number[]}>} combos  e.g. `combos` of `layerImage`
 * @param {Array<boolean|number>} [enabled]  per layer: true = all its coats, false or 0 = none,
 *   a number = only that many coats (the picture part-way through the painting); default all
 * @returns {Uint8ClampedArray} RGB triples, one per combination
 */
export function compositeColours(layers, combos, enabled) {
  const out = new Uint8ClampedArray(combos.length * 3)
  combos.forEach(({ coats }, i) => {
    let r = 1, g = 1, b = 1
    layers.forEach((layer, k) => {
      const show = enabled ? enabled[k] : true
      if (!show) return
      const o = (show === true ? coats[k] : Math.min(coats[k], show)) * 3
      r *= layer.filters[o]; g *= layer.filters[o + 1]; b *= layer.filters[o + 2]
    })
    out[i * 3] = linearToSrgb(r); out[i * 3 + 1] = linearToSrgb(g); out[i * 3 + 2] = linearToSrgb(b)
  })
  return out
}

/**
 * The picture with only some of the layers switched on.
 * @param {{layers: Layer[], combos: Array, comboMap: (Uint16Array|Int32Array)}} result  from `layerImage`
 * @param {Array<boolean|number>} [enabled]  per layer, see `compositeColours`; default all
 * @param {Uint8ClampedArray} [out]  RGBA buffer to reuse
 * @returns {Uint8ClampedArray} RGBA pixels
 */
export function renderLayers(result, enabled, out = new Uint8ClampedArray(result.comboMap.length * 4)) {
  const colours = compositeColours(result.layers, result.combos, enabled)
  const map = result.comboMap
  for (let p = 0; p < map.length; p++) {
    const c = map[p] * 3
    out[p * 4] = colours[c]; out[p * 4 + 1] = colours[c + 1]; out[p * 4 + 2] = colours[c + 2]; out[p * 4 + 3] = 255
  }
  return out
}

// Separate shapes a brush has to fill per coat of a layer: connected areas of "this coat or more",
// counted from the layer's areas of equal coats and which of them touch.
function shapesPerCoat(regionMap, regionCoats, width, height, top) {
  const count = regionCoats.length
  const parents = Array.from({ length: top + 1 }, () => Int32Array.from({ length: count }, (_, i) => i))
  const find = (parent, i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  const join = (p, q) => {
    const r = regionMap[p], s = regionMap[q]
    if (r === s) return
    for (let c = Math.min(regionCoats[r], regionCoats[s]); c >= 1; c--) {
      const a = find(parents[c], r), b = find(parents[c], s)
      if (a === b) break // joined for this coat means joined for every coat below it
      parents[c][a] = b
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1) join(p, p + 1)
      if (y < height - 1) join(p, p + width)
    }
  }
  const shapes = new Int32Array(top + 1)
  for (let c = 1; c <= top; c++) {
    for (let r = 0; r < count; r++) if (regionCoats[r] >= c && find(parents[c], r) === r) shapes[c]++
  }
  return shapes
}

/**
 * Full pipeline: picture -> layers.
 *
 * @param {Uint8ClampedArray} rgba  image data at working resolution
 * @param {Array<{id:string, hex:string}>} paints  the paint box
 * @param {{count?: number, paintIds?: string[], maxCoats?: number, graded?: boolean, simplify?: number, variety?: number}} options
 *   paintIds = the base paints; without it up to `count` paints are proposed (from the picture
 *   with a fixed blur, so the proposal is the same for every `simplify`).
 *   simplify 0..10 as in `segmentImage`: blur, smoothing and the smallest area of every layer.
 *   The washes are fitted to the blurred picture and get calm areas; the accents are fitted to
 *   what those washes leave over of the picture as it is, and may stay smaller.
 *   maxCoats = the most coats a wash layer can get. graded, variety: see `proposeLayerPaints`.
 * @returns {{
 *   width: number, height: number, maxCoats: number,
 *   paintIds: string[],
 *   layers: Array<Layer & {
 *     coatMap: Uint8Array,
 *     regionMap: Int32Array,
 *     regions: Array<{id:number, coats:number, size:number, anchorX:number, anchorY:number, anchorDist:number}>,
 *     coats: Array<{coats:number, hex:string, share:number, only:number, shapes:number}>,
 *     buys: {with:number, without:number, areaWith:number, areaWithout:number},
 *   }>,
 *   comboMap: (Uint16Array|Int32Array),
 *   combos: Array<{coats:number[], hex:string, pixelCount:number}>,
 *   steps: Array<{layer:number, kind:string, paintId:string, coat:number, strength:number, dilution:string,
 *     water:number, consistency:string, guide:string, hex:string, share:number, shapes:number}>,
 *   work: {steps:number, area:number},
 *   deltaE: {mean:number, p95:number, rough:number},
 * }}
 *   paintIds = the paints of the layers, in painting order, each once: the given ones, or the
 *   proposed ones (fewer than `count` when the rest would not pay for its work). A paint that is
 *   not needed with these settings keeps a layer without coats (`top` 0) at the end.
 *   layers = in painting order: the washes light to dark, then the accents light to dark. A paint
 *   can have two layers, a wash and an accent.
 *   Per layer: coatMap = coats per pixel; regionMap/regions = its connected areas of equal coats
 *   (also the unpainted ones, coats 0) with a label anchor each; coats[c - 1] = legend entry of
 *   coat c: the colour of c coats on white paper, `share` = part of the picture coat c covers
 *   (areas with c coats or more), `only` = part of the picture that ends with exactly c coats,
 *   `shapes` = separate shapes coat c is painted in. Always maxCoats entries; coats the layer
 *   does not have (above `top`) have share 0.
 *   buys = what the layer is good for: mean distance of the whole picture `with` all layers
 *   (the same for every layer, = deltaE.mean) and `without` this one, the others left as they
 *   are, and the same on the part of the picture this layer paints (`areaWith`, `areaWithout`).
 *   comboMap = per pixel the index into combos; combos = every combination of coats that occurs
 *   (coats[k] = coats of layer k) with the colour all layers give together.
 *   steps = what to paint, in order: layer by layer, coat 1 before coat 2. `hex` = that many
 *   coats on white paper, `shapes` = separate shapes to fill in this step.
 *   work = the number of steps and the area painted over all of them (1 = the whole picture
 *   once; also the mean number of coats on a spot).
 *   deltaE = distance between the picture as it is (not blurred) and all layers together; rough =
 *   part of the picture the layers miss by 10 or more.
 */
export function layerImage(rgba, width, height, paints, { count = 4, paintIds, maxCoats = MAX_COATS, graded = GRADED, simplify = 4, variety = 5 } = {}) {
  const pixels = width * height
  maxCoats = Math.max(1, maxCoats)
  const blur = Math.round(simplify / 3)
  const binsOf = (radius) => colourBins(toOklabPixels(boxBlur(rgba, width, height, radius), pixels), pixels)
  // The picture as it is, and its colours on a coarse grid: what the accents are fitted to.
  const lab = toOklabPixels(rgba, pixels)
  const sharp = colourBins(lab, pixels)
  const cells = joinColours(sharp.points, sharp.counts, 0.03, 0.015)
  // The picture blurred: what the washes are fitted to.
  const calm = blur ? binsOf(blur) : sharp
  const bins = calm.counts.length

  // What washes leave over: every pixel gets the washes of its blurred colour and keeps its own
  // colour; pixels alike in both are counted together.
  const left = (blurred) => (washes) => {
    const combos = combinations(tablesOf(washes), pricesOf(washes))
    const { best } = closest(combos, blurred.points, blurred.counts.length)
    const nc = cells.counts.length
    const seen = new Map()
    for (let p = 0; p < pixels; p++) {
      const key = best[blurred.binOf[p]] * nc + cells.cellOf[sharp.binOf[p]]
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const base = new Float64Array(seen.size * 3), points = new Float64Array(seen.size * 3), counts = new Float64Array(seen.size)
    let i = 0
    for (const [key, n] of seen) {
      const cell = key % nc, combo = (key - cell) / nc
      base.set(combos.lin.subarray(combo * 3, combo * 3 + 3), i * 3)
      points.set(cells.points.subarray(cell * 3, cell * 3 + 3), i * 3)
      counts[i++] = n
    }
    return { base, points, counts }
  }

  // The paints are chosen first, from the picture with a fixed blur; then they are planned like
  // paints the user has chosen. So the proposal does not depend on `simplify`, and planning it
  // again with its `paintIds` gives the same layers.
  let ids = paintIds
  if (!ids) {
    const blurred = blur === PROPOSAL_BLUR ? calm : binsOf(PROPOSAL_BLUR)
    ids = layersFor(blurred, paints, { count, maxCoats, graded, variety, left: left(blurred) }).layers.map((layer) => layer.paintId)
  }
  const base = unique(ids).map((id) => paints.find((p) => p.id === id)).filter(Boolean)
  const { layers, tables, prices } = layersFor(calm, base, { count: base.length, maxCoats, graded, variety, keepUnused: true, left: left(calm) })
  const all = combinations(tables, prices)
  const levelsOf = tables.map((t) => t.length / 3)
  const radix = levelsOf.map((_, k) => levelsOf.slice(0, k).reduce((r, l) => r * l, 1))
  const washes = layers.map((_, k) => k).filter((k) => layers[k].kind === 'wash' && levelsOf[k] > 1)
  const accents = layers.map((_, k) => k).filter((k) => layers[k].kind === 'accent')

  const passes = Math.ceil(simplify / 2)
  const minRegion = Math.max(2, (simplify + 1) ** 2, Math.round(pixels * 0.00004 * Math.pow(simplify + 1, 2.2)))
  const code = new Int32Array(pixels)
  const maps = layers.map(() => new Int32Array(pixels))

  // Layers are smoothed one by one, so where their edges moved apart they no longer add up to the
  // colour that was meant. Each area of each of the given layers therefore takes the number of
  // coats that suits the picture best, given what the other layers have become.
  const revise = (which) => {
    for (let round = 0; round < REVISIONS; round++) {
      let changed = false
      for (const k of which) {
        const levels = levelsOf[k], calmed = maps[k]
        const { regionMap, regionCluster } = connectedComponents(calmed, width, height)
        const cost = new Float64Array(regionCluster.length * levels)
        for (let p = 0; p < pixels; p++) {
          const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
          const rest = code[p] - calmed[p] * radix[k]
          const o = regionMap[p] * levels
          for (let c = 0; c < levels; c++) {
            const q = (rest + c * radix[k]) * 3
            const dL = all.lab[q] - L, da = all.lab[q + 1] - a, db = all.lab[q + 2] - b
            cost[o + c] += Math.sqrt(dL * dL + da * da + db * db) * 100 + prices[k] * c
          }
        }
        const coats = Int32Array.from(regionCluster)
        for (let r = 0; r < coats.length; r++) {
          // A change must pay: staying is the default.
          let least = cost[r * levels + coats[r]] * 0.999
          for (let c = 0; c < levels; c++) if (cost[r * levels + c] < least) { least = cost[r * levels + c]; coats[r] = c; changed = true }
        }
        for (let p = 0; p < pixels; p++) {
          const c = coats[regionMap[p]]
          code[p] += (c - calmed[p]) * radix[k]
          calmed[p] = c
        }
      }
      if (!changed) break
    }
  }

  // The washes: one map of coats per layer from the blurred picture, smoothed like the areas of
  // mix mode. Every colour takes the best combination of all layers, so that the washes stay
  // away from where an accent does better without them; the accents themselves come below.
  const { best } = closest(all, calm.points, bins)
  for (const k of washes) {
    const levels = levelsOf[k]
    const digit = new Int32Array(bins)
    for (let i = 0; i < bins; i++) digit[i] = ((best[i] / radix[k]) | 0) % levels
    const raw = new Int32Array(pixels)
    for (let p = 0; p < pixels; p++) raw[p] = digit[calm.binOf[p]]
    maps[k] = mergeSmallRegions(majorityFilter(raw, width, height, levels, passes), width, height, minRegion)
    for (let p = 0; p < pixels; p++) code[p] += maps[k][p] * radix[k]
  }
  if (washes.length > 1) revise(washes)

  // The accents, from the picture as it is: every pixel takes the accents that bring it closer.
  // Their areas are only cleared of specks, not smoothed: they are for the small things.
  // Inside an area of an accent the washes are then fitted to the accent: the painter leaves that
  // shape out of a wash, or gives it fewer coats, so that a turquoise detail is not painted over
  // an orange wash.
  if (accents.length) {
    const { best: ideal } = closest(all, cells.points, cells.counts.length)
    const first = radix[accents[0]]
    const options = 1 << accents.length
    const raws = accents.map(() => new Int32Array(pixels))
    for (let p = 0; p < pixels; p++) {
      const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
      // Over the washes as they are ...
      let least = Infinity, pick = 0
      for (let o = 0; o < options; o++) {
        const q = code[p] + o * first
        const dL = all.lab[q * 3] - L, da = all.lab[q * 3 + 1] - a, db = all.lab[q * 3 + 2] - b
        const cost = Math.sqrt(dL * dL + da * da + db * db) + all.work[q]
        if (cost < least) { least = cost; pick = o }
      }
      // ... or with the washes this colour would choose for itself, if that is clearly closer.
      const q = ideal[cells.cellOf[sharp.binOf[p]]]
      const own = ((q / first) | 0) % options
      if (own && own !== pick) {
        const dL = all.lab[q * 3] - L, da = all.lab[q * 3 + 1] - a, db = all.lab[q * 3 + 2] - b
        if (Math.sqrt(dL * dL + da * da + db * db) + all.work[q] + CARVE_GAIN / 100 < least) pick = own
      }
      for (let j = 0; j < accents.length; j++) raws[j][p] = (pick >> j) & 1
    }
    accents.forEach((k, j) => {
      // No majority filter here: it would eat the thin lines accents are there for.
      maps[k] = mergeSmallRegions(raws[j], width, height, Math.max(2, Math.round(minRegion * ACCENT_REGION)))
      for (let p = 0; p < pixels; p++) code[p] += maps[k][p] * radix[k]
    })
    for (const k of accents) {
      const { regionMap, regionCluster } = connectedComponents(maps[k], width, height)
      for (let round = 0; round < REVISIONS; round++) {
        for (const w of washes) {
          const levels = levelsOf[w]
          const cost = new Float64Array(regionCluster.length * levels)
          for (let p = 0; p < pixels; p++) {
            if (!maps[k][p]) continue
            const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
            const rest = code[p] - maps[w][p] * radix[w]
            const o = regionMap[p] * levels
            for (let c = 0; c < levels; c++) {
              // "At most c coats here": a wash only ever does less under an accent, never more.
              const kept = Math.min(c, maps[w][p])
              const q = (rest + kept * radix[w]) * 3
              const dL = all.lab[q] - L, da = all.lab[q + 1] - a, db = all.lab[q + 2] - b
              cost[o + c] += Math.sqrt(dL * dL + da * da + db * db) * 100 + prices[w] * kept
            }
          }
          for (let p = 0; p < pixels; p++) {
            if (!maps[k][p]) continue
            const o = regionMap[p] * levels
            let most = levels - 1
            for (let c = levels - 2; c >= 0; c--) if (cost[o + c] < cost[o + most]) most = c
            if (most >= maps[w][p]) continue
            code[p] += (most - maps[w][p]) * radix[w]
            maps[w][p] = most
          }
        }
      }
    }
    // An area of an accent that does not pay over the washes as they are now goes again.
    revise(accents)
  }

  layers.forEach((layer, k) => {
    const calmed = maps[k]
    const { regionMap, regionCluster, regionSize } = connectedComponents(calmed, width, height)
    const anchors = labelAnchors(regionMap, width, height, regionCluster.length)
    const shapes = shapesPerCoat(regionMap, regionCluster, width, height, layer.top)
    const only = new Float64Array(maxCoats + 1)
    layer.coatMap = new Uint8Array(pixels)
    for (let p = 0; p < pixels; p++) {
      layer.coatMap[p] = calmed[p]
      only[calmed[p]]++
    }
    layer.regionMap = regionMap
    layer.regions = regionCluster.map((coats, id) => ({
      id,
      coats,
      size: regionSize[id],
      anchorX: anchors[id].x,
      anchorY: anchors[id].y,
      anchorDist: anchors[id].d,
    }))
    layer.coats = []
    for (let c = maxCoats, covered = 0; c >= 1; c--) {
      covered += only[c]
      layer.coats[c - 1] = { coats: c, hex: layer.hexes[c], share: covered / pixels, only: only[c] / pixels, shapes: shapes[c] ?? 0 }
    }
  })

  // The combinations that are left after smoothing, the distance to the picture, and what the
  // picture would lose without each layer.
  const indexOf = new Int32Array(all.size).fill(-1)
  const combos = []
  const comboMap = all.size <= 65536 ? new Uint16Array(pixels) : new Int32Array(pixels)
  const errors = new Float32Array(pixels)
  const lost = layers.map(() => ({ without: 0, area: 0, areaWith: 0, areaWithout: 0 }))
  let sum = 0, rough = 0
  for (let p = 0; p < pixels; p++) {
    const c = code[p]
    let i = indexOf[c]
    if (i < 0) {
      i = indexOf[c] = combos.length
      combos.push({ coats: coatsOf(c, tables), hex: linearHex(all.lin, c * 3), pixelCount: 0 })
    }
    combos[i].pixelCount++
    comboMap[p] = i
    const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
    const dL = all.lab[c * 3] - L, da = all.lab[c * 3 + 1] - a, db = all.lab[c * 3 + 2] - b
    const e = Math.sqrt(dL * dL + da * da + db * db) * 100
    errors[p] = e
    sum += e
    if (e >= 10) rough++
    for (let k = 0; k < layers.length; k++) {
      const coat = maps[k][p]
      if (!coat) continue
      const q = (c - coat * radix[k]) * 3
      const without = Math.hypot(all.lab[q] - L, all.lab[q + 1] - a, all.lab[q + 2] - b) * 100
      lost[k].without += without - e
      lost[k].area++; lost[k].areaWith += e; lost[k].areaWithout += without
    }
  }
  errors.sort()
  const mean = pixels ? sum / pixels : 0
  layers.forEach((layer, k) => {
    const { without, area, areaWith, areaWithout } = lost[k]
    layer.buys = { with: mean, without: mean + (pixels ? without / pixels : 0), areaWith: area ? areaWith / area : 0, areaWithout: area ? areaWithout / area : 0 }
  })

  const steps = []
  for (const layer of layers) {
    for (const coat of layer.coats) {
      if (coat.share > 0) steps.push({ layer: layer.index, kind: layer.kind, paintId: layer.paintId, coat: coat.coats, ...layer.washes[coat.coats - 1], hex: coat.hex, share: coat.share, shapes: coat.shapes })
    }
  }
  const area = steps.reduce((total, step) => total + step.share, 0)
  return {
    width,
    height,
    maxCoats,
    paintIds: unique(layers.map((l) => l.paintId)),
    layers,
    comboMap,
    combos,
    steps,
    work: { steps: steps.length, area },
    deltaE: {
      mean,
      p95: pixels ? errors[Math.min(pixels - 1, Math.floor(pixels * 0.95))] : 0,
      rough: pixels ? rough / pixels : 0,
    },
  }
}
