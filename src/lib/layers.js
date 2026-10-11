// Layer mode (glazing): the picture as transparent layers painted over each other, light to dark.
//
// Mix mode mixes every colour on the palette and paints each area once. Layer mode uses what only
// watercolour does: a dried wash is a filter, and a second wash over it filters the light again.
// So the absorbances of separate layers add up, and a few base paints reach the secondary colours
// (yellow over blue is a green) and the darks without any mixing.
//
// Model:
// - Every base paint is one layer, painted with ONE prepared wash (its strength = paint to water).
// - Every area gets 0..maxCoats coats of that wash. Coats are nested: coat 2 lies inside coat 1.
// - The colour of an area is white paper filtered by every layer:
//   reflectance = exp(-sum over layers of depth(coats * strength, limit of the paint) * A of the paint).
//   Different paints add up without a common limit, which is what a wet mix cannot do. The coats of
//   ONE paint share that paint's limit: three coats of yellow come closer to the yellow's masstone,
//   they do not turn into an orange. For watery washes this is the same as "coats times the wash".
// - Option `graded`: every coat of a layer may be a stronger wash than the one before (light to
//   dark within the paint as well). Measured on the sample pictures this brings the colours about
//   a tenth closer and is not visible once the areas are smoothed, for up to maxCoats washes to
//   prepare per paint instead of one. So one wash per paint is the default.
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

/** Coats per layer when nothing else is asked for. */
export const MAX_COATS = 3
/** More layers than this are not fitted: every combination of coats is looked at, (maxCoats + 1) ^ layers. */
export const MAX_LAYERS = 7
// Whether the coats of a layer may differ in strength when nothing else is asked for.
const GRADED = false
// Wash strengths tried when the paints are chosen; the strengths are tuned freely afterwards.
const STRENGTHS = [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.4]
const MIN_STRENGTH = 0.05
const MAX_STRENGTH = 4
// Graded coats: every coat this many times stronger than the one before (1 = the same wash again).
const RATIOS = [1, 1.7, 3]
const MAX_RATIO = 4
// The fit runs on at most about this many colours, however colourful the picture is.
const FIT_COLOURS = 220
// Weight of a colour in the fit = (its pixel count) ^ FIT_AREA_POWER. Below 1 the small colourful
// parts of a picture count for more than their area, see AREA_POWER in segment.js.
const FIT_AREA_POWER = 1
// While paints and washes are tried out, every colour only looks at its few best combinations of
// the other layers instead of at all of them.
const SHORTLIST = 5
// How often the chosen paints are gone through to exchange one for a better one.
const SWAP_ROUNDS = 3
// Every coat must buy about this much deltaE to be used: between two combinations that look the
// same, the one with fewer coats is less work and gives calmer layers.
const COAT_COST = 0.1
// Rounds in which the areas of the smoothed layers are fitted to each other.
const REVISIONS = 2

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

// What a layer does to the light, per number of coats: (maxCoats + 1) x 3 factors on linear RGB.
function filterTable(A, limit, strength, ratio, maxCoats) {
  const t = new Float64Array((maxCoats + 1) * 3)
  for (let c = 0; c <= maxCoats; c++) {
    const d = coatDepth(c, strength, limit, ratio)
    t[c * 3] = Math.exp(-d * A[0]); t[c * 3 + 1] = Math.exp(-d * A[1]); t[c * 3 + 2] = Math.exp(-d * A[2])
  }
  return t
}

// Every combination of coats of the given layers on white paper: linear RGB and OKLab.
// Combination index = coats of layer 0 + levels * (coats of layer 1 + levels * ...).
function combinations(tables) {
  let lin = new Float64Array([1, 1, 1])
  for (const t of tables) {
    const levels = t.length / 3, n = lin.length / 3
    const next = new Float64Array(n * levels * 3)
    for (let c = 0; c < levels; c++) {
      for (let i = 0; i < n; i++) {
        const o = (c * n + i) * 3
        next[o] = lin[i * 3] * t[c * 3]; next[o + 1] = lin[i * 3 + 1] * t[c * 3 + 1]; next[o + 2] = lin[i * 3 + 2] * t[c * 3 + 2]
      }
    }
    lin = next
  }
  const size = lin.length / 3
  const lab = new Float64Array(size * 3)
  for (let i = 0; i < size; i++) writeLab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2], lab, i * 3)
  return { lin, lab, size }
}

// Total number of coats of every combination, for the price of a coat.
function coatTotals(size, levels) {
  const totals = new Int32Array(size)
  for (let i = 1; i < size; i++) totals[i] = totals[(i / levels) | 0] + (i % levels)
  return totals
}

/**
 * The closest combination for every colour.
 * @returns {{best: Int32Array, error: Float64Array}} combination index and deltaE per colour
 */
function closest(combos, points, n, levels, coatCost) {
  const best = new Int32Array(n)
  const error = new Float64Array(n)
  const { lab, size } = combos
  const price = new Float64Array(size)
  if (coatCost) {
    const totals = coatTotals(size, levels)
    for (let p = 0; p < size; p++) price[p] = ((coatCost * totals[p]) / 100) ** 2
  }
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    let bd = Infinity, bi = 0
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d = dL * dL + da * da + db * db + price[p]
      if (d < bd) { bd = d; bi = p }
    }
    best[i] = bi
    error[i] = Math.sqrt(bd - price[bi]) * 100
  }
  return { best, error }
}

// For every colour its `keep` closest combinations of the given layers, as linear RGB: what the
// other layers can offer a new layer to work on.
function shortlist(tables, points, n, keep) {
  const combos = combinations(tables)
  const T = Math.min(keep, combos.size)
  const { lab, lin, size } = combos
  const base = new Float64Array(n * T * 3)
  const topD = new Float64Array(T), topI = new Int32Array(T)
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    topD.fill(Infinity)
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d = dL * dL + da * da + db * db
      if (d < topD[T - 1]) {
        let s = T - 1
        while (s > 0 && topD[s - 1] > d) { topD[s] = topD[s - 1]; topI[s] = topI[s - 1]; s-- }
        topD[s] = d; topI[s] = p
      }
    }
    for (let s = 0; s < T; s++) {
      const o = (i * T + s) * 3, p = topI[s] * 3
      base[o] = lin[p]; base[o + 1] = lin[p + 1]; base[o + 2] = lin[p + 2]
    }
  }
  return { base, T }
}

// Weighted mean deltaE of the colours when one more layer is laid over their shortlisted
// combinations. Gives up as soon as the sum passes `bound` (the best so far).
const scratch = new Float64Array(3)
function errorWith(table, { base, T }, set, bound = Infinity) {
  const { points, weights, n } = set
  const levels = table.length / 3
  let sum = 0
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    let bd = Infinity
    for (let s = 0; s < T; s++) {
      const o = (i * T + s) * 3
      for (let c = 0; c < levels; c++) {
        writeLab(base[o] * table[c * 3], base[o + 1] * table[c * 3 + 1], base[o + 2] * table[c * 3 + 2], scratch, 0)
        const dL = scratch[0] - L, da = scratch[1] - a, db = scratch[2] - b
        const d = dL * dL + da * da + db * db
        if (d < bd) bd = d
      }
    }
    sum += weights[i] * Math.sqrt(bd)
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
 * The colours of a picture, for `proposeLayerPaints` and `fitLayers`.
 * @param {Uint8ClampedArray} rgba  image data at working resolution
 * @param {{simplify?: number}} options  the same blur as in `layerImage`
 * @returns {{points: Float64Array, counts: Float64Array}}
 */
export function pictureColours(rgba, width, height, { simplify = 4 } = {}) {
  const count = width * height
  const { points, counts } = colourBins(toOklabPixels(boxBlur(rgba, width, height, Math.round(simplify / 3)), count), count)
  return { points, counts }
}

// The colours the fit works on: the given ones, joined on a coarser grid until few enough are
// left, sorted by weight so that a bad candidate is given up early.
function fitSet({ points, counts }, areaPower) {
  const total = counts.length
  let n = total, pts = points, cnt = counts
  for (let stepL = 0.03, stepAB = 0.015; n > FIT_COLOURS; stepL *= 1.3, stepAB *= 1.3) {
    const index = new Map()
    const sums = []
    for (let i = 0; i < total; i++) {
      const key = Math.round(points[i * 3] / stepL) * 1048576 + (Math.round(points[i * 3 + 1] / stepAB) + 512) * 1024 + Math.round(points[i * 3 + 2] / stepAB) + 512
      let j = index.get(key)
      if (j === undefined) { j = sums.length / 4; index.set(key, j); sums.push(0, 0, 0, 0) }
      sums[j * 4] += points[i * 3] * counts[i]; sums[j * 4 + 1] += points[i * 3 + 1] * counts[i]; sums[j * 4 + 2] += points[i * 3 + 2] * counts[i]
      sums[j * 4 + 3] += counts[i]
    }
    n = sums.length / 4
    pts = new Float64Array(n * 3); cnt = new Float64Array(n)
    for (let j = 0; j < n; j++) {
      cnt[j] = sums[j * 4 + 3]
      pts[j * 3] = sums[j * 4] / cnt[j]; pts[j * 3 + 1] = sums[j * 4 + 1] / cnt[j]; pts[j * 3 + 2] = sums[j * 4 + 2] / cnt[j]
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => cnt[y] - cnt[x] || x - y)
  const outPts = new Float64Array(n * 3), weights = new Float64Array(n)
  let sum = 0
  order.forEach((i, j) => {
    outPts[j * 3] = pts[i * 3]; outPts[j * 3 + 1] = pts[i * 3 + 1]; outPts[j * 3 + 2] = pts[i * 3 + 2]
    weights[j] = Math.pow(cnt[i], areaPower)
    sum += weights[j]
  })
  // Weights add up to 100, so the error of a set of layers reads as a weighted mean deltaE.
  for (let j = 0; j < n; j++) weights[j] *= 100 / sum
  return { points: outPts, weights, n }
}

// Choose `count` paints and their washes. The search can get stuck, and graded coats give it more
// room to do so: it therefore runs once with even coats and once with graded ones, both tuned in
// the end with everything allowed, and the better result counts.
function chooseLayers(set, paints, count, maxCoats, graded) {
  const maxRatio = graded && maxCoats > 1 ? MAX_RATIO : 1
  const levels = maxCoats + 1
  count = Math.min(count, MAX_LAYERS)
  let best = null
  for (const ratios of maxRatio > 1 ? [[1], RATIOS] : [[1]]) {
    const chosen = searchLayers(set, paints, count, maxCoats, ratios, maxRatio)
    const tables = chosen.map((layer) => filterTable(layer.A, layer.limit, layer.strength, layer.ratio, maxCoats))
    const { error } = closest(combinations(tables), set.points, set.n, levels, 0)
    let sum = 0
    for (let i = 0; i < set.n; i++) sum += set.weights[i] * error[i]
    if (!best || sum < best.sum - 1e-9) best = { chosen, sum }
  }
  return best.chosen
}

// One run of the search: add the paint that helps most, one at a time, then exchange every chosen
// paint for a better one as long as that helps, then tune the washes.
function searchLayers(set, paints, count, maxCoats, ratios, maxRatio) {
  const washes = []
  for (const ratio of ratios) {
    for (const strength of STRENGTHS) if (strength * Math.pow(ratio, maxCoats - 1) <= MAX_STRENGTH) washes.push({ strength, ratio })
  }
  const pool = paints.map((paint) => {
    const A = absorbanceFromHex(paint.hex)
    const limit = depthLimit(A)
    return { paint, A, limit, tables: washes.map((w) => filterTable(A, limit, w.strength, w.ratio, maxCoats)) }
  })
  const chosen = []
  const tableOf = (layer) => filterTable(layer.A, layer.limit, layer.strength, layer.ratio, maxCoats)
  const others = (skip) => shortlist(chosen.filter((_, i) => i !== skip).map(tableOf), set.points, set.n, SHORTLIST)
  // The best paint and wash for the place `skip` (or for a new place).
  const bestFor = (skip, bound) => {
    const rest = others(skip)
    let best = null
    for (const candidate of pool) {
      if (chosen.some((layer, i) => i !== skip && layer.paint === candidate.paint)) continue
      candidate.tables.forEach((table, s) => {
        const error = errorWith(table, rest, set, bound)
        if (error < bound) { bound = error; best = { ...candidate, ...washes[s], error } }
      })
    }
    return best
  }
  const wanted = Math.min(count, pool.length)
  let error = Infinity
  while (chosen.length < wanted) {
    const next = bestFor(-1, Infinity)
    if (!next) break
    chosen.push(next)
    error = next.error
  }
  const exchange = () => {
    let improved = false
    for (let round = 0; round < SWAP_ROUNDS && chosen.length > 1; round++) {
      let better = false
      for (let k = 0; k < chosen.length; k++) {
        const next = bestFor(k, error * 0.999)
        if (next) { chosen[k] = next; error = next.error; better = improved = true }
      }
      if (!better) break
    }
    return improved
  }
  // Washes: for one layer after the other, a search on the water level of the first coat and on
  // how much stronger the next coats are, with the other layers fixed.
  const clamp = (s, r) => {
    const ratio = Math.min(maxRatio, Math.max(1, r))
    return [Math.min(MAX_STRENGTH / Math.pow(ratio, maxCoats - 1), Math.max(MIN_STRENGTH, s)), ratio]
  }
  const tune = () => {
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < chosen.length; k++) {
        const rest = others(k)
        const layer = chosen[k]
        const errorAt = ([s, r]) => errorWith(filterTable(layer.A, layer.limit, s, r, maxCoats), rest, set)
        let at = [layer.strength, layer.ratio], best = errorAt(at)
        for (let step = 0.3; step > 0.01; step /= 2) {
          for (let moved = true; moved; ) {
            moved = false
            for (const [ds, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
              if (dr && maxRatio === 1) continue
              const trial = clamp(at[0] * Math.exp(ds * step), at[1] * Math.exp(dr * step))
              const e = errorAt(trial)
              if (e < best - 1e-9) { best = e; at = trial; moved = true; break }
            }
          }
        }
        layer.strength = at[0]; layer.ratio = at[1]
        error = best
      }
    }
  }
  exchange()
  tune()
  // Tuned washes can make room for another paint.
  if (exchange()) tune()
  return chosen
}

// Lightest layer first: OKLab lightness of the layer with all its coats on.
function lightToDark(chosen, maxCoats) {
  const lab = new Float64Array(3)
  return chosen
    .map((layer, i) => {
      const t = filterTable(layer.A, layer.limit, layer.strength, layer.ratio, maxCoats)
      writeLab(t[maxCoats * 3], t[maxCoats * 3 + 1], t[maxCoats * 3 + 2], lab, 0)
      return { layer, L: lab[0], i }
    })
    .sort((x, y) => y.L - x.L || x.i - y.i)
    .map((x) => x.layer)
}

function describeLayer(layer, index, maxCoats) {
  const table = filterTable(layer.A, layer.limit, layer.strength, layer.ratio, maxCoats)
  return {
    index,
    paintId: layer.paint.id,
    strength: layer.strength,
    dilution: describeDilution(layer.strength),
    ratio: layer.ratio,
    washes: Array.from({ length: maxCoats }, (_, c) => {
      const strength = layer.strength * Math.pow(layer.ratio, c)
      return { strength, dilution: describeDilution(strength) }
    }),
    depths: Array.from({ length: maxCoats + 1 }, (_, c) => coatDepth(c, layer.strength, layer.limit, layer.ratio)),
    hexes: Array.from({ length: maxCoats + 1 }, (_, c) => linearHex(table, c * 3)),
    filters: table,
  }
}

/**
 * Propose the base paints for a set of colours.
 * @param {{points: Float64Array, counts: Float64Array}} colours  from `pictureColours` or `colourSet`
 * @param {Array<{id:string, hex:string}>} paints  paints to choose from
 * @param {{count?: number, maxCoats?: number, graded?: boolean, areaPower?: number}} options
 *   count = number of layers; graded = coats of a layer may get stronger from coat to coat;
 *   areaPower = weight of a colour is (its count) ^ areaPower, below 1 small areas count for more
 * @returns {string[]} paint ids, lightest layer first
 */
export function proposeLayerPaints(colours, paints, { count = 4, maxCoats = MAX_COATS, graded = GRADED, areaPower = FIT_AREA_POWER } = {}) {
  if (!paints.length || !colours.counts.length) return []
  return lightToDark(chooseLayers(fitSet(colours, areaPower), paints, count, maxCoats, graded), maxCoats).map((layer) => layer.paint.id)
}

/**
 * @typedef {Object} Layer
 * @property {number} index        place in the painting order, 0 = first (lightest)
 * @property {string} paintId
 * @property {number} strength     the wash: amount of paint, 1 = as strong as the paint's swatch
 * @property {string} dilution     the wash in words (`describeDilution`)
 * @property {number} ratio        1 = every coat is the same wash; graded: coat c + 1 is this much stronger than coat c
 * @property {Array<{strength:number, dilution:string}>} washes  the wash of coat 1..maxCoats (all the same unless graded)
 * @property {number[]} depths     depth after 0..maxCoats coats
 * @property {string[]} hexes      colour of 0..maxCoats coats on white paper; hexes[0] is the paper
 * @property {Float64Array} filters  (maxCoats + 1) x 3 factors on linear RGB, for `compositeColours`
 */

/**
 * Fit one wash per paint and the coats of every colour.
 * @param {{points: Float64Array, counts: Float64Array}} colours  from `pictureColours` or `colourSet`
 * @param {Array<{id:string, hex:string}>} paints  the base paints, one layer each
 * @param {{maxCoats?: number, graded?: boolean, areaPower?: number}} options  see `proposeLayerPaints`
 * @returns {{layers: Layer[], coats: number[][], hexes: string[], deltaE: number[], error: number}}
 *   layers = lightest first; coats[i][k] = coats of layer k for colour i; hexes[i] = the colour
 *   those coats give; deltaE[i] = its distance to colour i; error = mean deltaE weighted by count
 */
export function fitLayers(colours, paints, { maxCoats = MAX_COATS, graded = GRADED, areaPower = FIT_AREA_POWER } = {}) {
  const n = colours.counts.length
  const chosen = paints.length && n ? lightToDark(chooseLayers(fitSet(colours, areaPower), paints, paints.length, maxCoats, graded), maxCoats) : []
  const layers = chosen.map((layer, k) => describeLayer(layer, k, maxCoats))
  const levels = maxCoats + 1
  const combos = combinations(layers.map((l) => l.filters))
  const { best, error } = closest(combos, colours.points, n, levels, COAT_COST)
  let sum = 0, total = 0
  for (let i = 0; i < n; i++) { sum += error[i] * colours.counts[i]; total += colours.counts[i] }
  return {
    layers,
    coats: Array.from(best, (combo) => layers.map(() => { const c = combo % levels; combo = (combo / levels) | 0; return c })),
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

/**
 * Full pipeline: picture -> layers.
 *
 * @param {Uint8ClampedArray} rgba  image data at working resolution
 * @param {Array<{id:string, hex:string}>} paints  the paint box
 * @param {{count?: number, paintIds?: string[], maxCoats?: number, graded?: boolean, simplify?: number, areaPower?: number}} options
 *   paintIds = the base paints (one layer each); without it `count` paints are proposed.
 *   simplify 0..10 as in `segmentImage`: blur, smoothing and the smallest area of every layer.
 *   graded, areaPower: see `proposeLayerPaints`.
 * @returns {{
 *   width: number, height: number, maxCoats: number,
 *   paintIds: string[],
 *   layers: Array<Layer & {
 *     coatMap: Uint8Array,
 *     regionMap: Int32Array,
 *     regions: Array<{id:number, coats:number, size:number, anchorX:number, anchorY:number, anchorDist:number}>,
 *     coats: Array<{coats:number, hex:string, share:number, only:number}>,
 *   }>,
 *   comboMap: (Uint16Array|Int32Array),
 *   combos: Array<{coats:number[], hex:string, pixelCount:number}>,
 *   steps: Array<{layer:number, paintId:string, coat:number, strength:number, dilution:string, hex:string, share:number}>,
 *   deltaE: {mean:number, p95:number, rough:number},
 * }}
 *   paintIds = the base paints in painting order (same order as `layers`).
 *   Per layer: coatMap = coats per pixel; regionMap/regions = its connected areas of equal coats
 *   (also the unpainted ones, coats 0) with a label anchor each; coats[c - 1] = legend entry of
 *   coat c: the colour of c coats on white paper, `share` = part of the picture coat c covers
 *   (areas with c coats or more), `only` = part of the picture that ends with exactly c coats.
 *   comboMap = per pixel the index into combos; combos = every combination of coats that occurs
 *   (coats[k] = coats of layer k) with the colour all layers give together.
 *   steps = what to paint, in order: layers light to dark, coat 1 before coat 2; coats nobody
 *   needs are left out. deltaE = distance between the (blurred) picture and all layers together;
 *   rough = part of the picture the layers miss by 10 or more (out of reach of these paints).
 */
export function layerImage(rgba, width, height, paints, { count = 4, paintIds, maxCoats = MAX_COATS, graded = GRADED, simplify = 4, areaPower = FIT_AREA_POWER } = {}) {
  const pixels = width * height
  const levels = maxCoats + 1
  const lab = toOklabPixels(boxBlur(rgba, width, height, Math.round(simplify / 3)), pixels)
  const { points, counts, binOf } = colourBins(lab, pixels)
  const bins = counts.length

  const base = paintIds ? paintIds.map((id) => paints.find((p) => p.id === id)).filter(Boolean) : paints
  const chosen = base.length && bins ? lightToDark(chooseLayers(fitSet({ points, counts }, areaPower), base, paintIds ? base.length : count, maxCoats, graded), maxCoats) : []
  const layers = chosen.map((layer, k) => describeLayer(layer, k, maxCoats))
  const all = combinations(layers.map((l) => l.filters))
  const { best } = closest(all, points, bins, levels, COAT_COST)

  // One map of coats per layer, smoothed like the areas of mix mode.
  const passes = Math.ceil(simplify / 2)
  const minRegion = Math.max(2, (simplify + 1) ** 2, Math.round(pixels * 0.00004 * Math.pow(simplify + 1, 2.2)))
  const code = new Int32Array(pixels)
  const maps = layers.map((_, k) => {
    const radix = levels ** k
    const digit = new Int32Array(bins)
    for (let i = 0; i < bins; i++) digit[i] = ((best[i] / radix) | 0) % levels
    const raw = new Int32Array(pixels)
    for (let p = 0; p < pixels; p++) raw[p] = digit[binOf[p]]
    const calm = mergeSmallRegions(majorityFilter(raw, width, height, levels, passes), width, height, minRegion)
    for (let p = 0; p < pixels; p++) code[p] += calm[p] * radix
    return calm
  })

  // Every layer was smoothed on its own, so where their edges moved apart the layers no longer
  // add up to the colour that was meant. Each area of each layer therefore takes the number of
  // coats that suits the picture best, given what the other layers have become.
  for (let round = 0; round < REVISIONS && layers.length > 1; round++) {
    let changed = false
    maps.forEach((calm, k) => {
      const radix = levels ** k
      const { regionMap, regionCluster } = connectedComponents(calm, width, height)
      const cost = new Float64Array(regionCluster.length * levels)
      for (let p = 0; p < pixels; p++) {
        const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
        const rest = code[p] - calm[p] * radix
        const o = regionMap[p] * levels
        for (let c = 0; c < levels; c++) {
          const q = (rest + c * radix) * 3
          const dL = all.lab[q] - L, da = all.lab[q + 1] - a, db = all.lab[q + 2] - b
          cost[o + c] += Math.sqrt(dL * dL + da * da + db * db) * 100 + COAT_COST * c
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
        code[p] += (c - calm[p]) * radix
        calm[p] = c
      }
    })
    if (!changed) break
  }

  layers.forEach((layer, k) => {
    const calm = maps[k]
    const { regionMap, regionCluster, regionSize } = connectedComponents(calm, width, height)
    const anchors = labelAnchors(regionMap, width, height, regionCluster.length)
    const only = new Float64Array(levels)
    layer.coatMap = new Uint8Array(pixels)
    for (let p = 0; p < pixels; p++) {
      layer.coatMap[p] = calm[p]
      only[calm[p]]++
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
      layer.coats[c - 1] = { coats: c, hex: layer.hexes[c], share: covered / pixels, only: only[c] / pixels }
    }
  })

  // The combinations that are left after smoothing, and the distance to the picture.
  const indexOf = new Int32Array(all.size).fill(-1)
  const combos = []
  const comboMap = all.size <= 65536 ? new Uint16Array(pixels) : new Int32Array(pixels)
  const errors = new Float32Array(pixels)
  let sum = 0, rough = 0
  for (let p = 0; p < pixels; p++) {
    const c = code[p]
    let i = indexOf[c]
    if (i < 0) {
      i = indexOf[c] = combos.length
      let rest = c
      combos.push({ coats: layers.map(() => { const d = rest % levels; rest = (rest / levels) | 0; return d }), hex: linearHex(all.lin, c * 3), pixelCount: 0 })
    }
    combos[i].pixelCount++
    comboMap[p] = i
    const dL = all.lab[c * 3] - lab[p * 3], da = all.lab[c * 3 + 1] - lab[p * 3 + 1], db = all.lab[c * 3 + 2] - lab[p * 3 + 2]
    errors[p] = Math.sqrt(dL * dL + da * da + db * db) * 100
    sum += errors[p]
    if (errors[p] >= 10) rough++
  }
  errors.sort()

  const steps = []
  for (const layer of layers) {
    for (const coat of layer.coats) {
      if (coat.share > 0) steps.push({ layer: layer.index, paintId: layer.paintId, coat: coat.coats, ...layer.washes[coat.coats - 1], hex: coat.hex, share: coat.share })
    }
  }
  return {
    width,
    height,
    maxCoats,
    paintIds: layers.map((l) => l.paintId),
    layers,
    comboMap,
    combos,
    steps,
    deltaE: {
      mean: pixels ? sum / pixels : 0,
      p95: pixels ? errors[Math.min(pixels - 1, Math.floor(pixels * 0.95))] : 0,
      rough: pixels ? rough / pixels : 0,
    },
  }
}
