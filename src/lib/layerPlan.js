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
//   reach: a small area of another hue, the darkest folds. It is fitted to what the washes leave
//   over and painted last, in a few shapes a brush can do. Its paint may be one of the wash paints
//   or a paint of its own (accent paints come on top of the number of paints asked for).
// - The colour of an area is white paper filtered by every layer:
//   reflectance = exp(-sum over layers of depth * A of the paint).
//   Different paints add up without a common limit, which is what a wet mix cannot do. The coats of
//   ONE paint add up to the paint as its swatch shows it and no further (MAX_AMOUNT): three
//   coats of a light yellow wash come closer to the yellow, they never get darker than it. An
//   accent of a paint that is also a wash adds what is left up to that.
// - Work has a price. Every coat must make the colour it is painted on visibly better, every step
//   (one wash over the dried picture) must make the picture better, and an accent must make its
//   small part much better. What does not pay is left out: a layer can end up with one coat, and
//   fewer paints than asked for are proposed when the rest would only be tints nobody sees.
// - A grey or brown over a clean colour dulls it, and a painter keeps neutrals off clean colour.
//   So a coat of a near-neutral paint costs extra where the picture is saturated: such a paint
//   goes into the shadows and the greys, not as a tint under the reds.
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
// This is the reference of what the server does (server/mix/layers.php): it is not part of the
// app that goes to the browser. The pixels stay in the browser; layers.js lays the plan over them.

import { hexToRgb, rgbToLinear } from './color.js'
import { absorbanceFromHex, depthLimit, depth as depthOf, describeDilution, MAX_AMOUNT } from './mixing.js'
import { MAX_COATS, ACCENTS, GRADED, CARVE_GAIN, DARK_FROM, dulling, writeLab, linearHex, combinations, closest, joinColours, coatsOf, unique } from './layers.js'


// Depth of a paint on the paper. However many coats, a paint never gets deeper than its swatch
// (MAX_AMOUNT): further coats of the same paint add nothing, only another paint over it does.
const depth = (amount, limit) => depthOf(Math.min(MAX_AMOUNT, amount), limit)

/** More paints than this are not fitted: every combination of coats is looked at. */
export const MAX_LAYERS = 7
/**
 * Parts of water to one part of paint (as it comes from the tube, or a pan worked up to that
 * consistency) that are taken to give strength 1, the paint's swatch. An assumption, not a
 * measurement: swatch a few washes and adjust it.
 */
export const REFERENCE_WATER = 1
// Combinations of coats of all layers that are still looked at one by one.
const MAX_COMBINATIONS = 40000
// Wash strengths tried when the paints are chosen; the strengths are tuned freely afterwards.
const STRENGTHS = [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 0.8, 1]
const ACCENT_STRENGTHS = [0.25, 0.4, 0.6, 0.8, 1]
const MIN_STRENGTH = 0.05
// No wash is stronger than the paint as its swatch shows it.
const MAX_STRENGTH = MAX_AMOUNT
// Graded coats: every coat this many times stronger than the one before (1 = the same wash again).
const RATIOS = [1, 1.7, 3]
const MAX_RATIO = 4
// The fit runs on at most about this many colours, however colourful the picture is.
const FIT_COLOURS = 220
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
// A coat of a neutral paint costs this much more on a fully saturated colour (see `dulling`).
const DULL_PRICE = 4
// A paint counts as neutral below this OKLab chroma of its swatch, the more the greyer it is.
const NEUTRAL_CHROMA = 0.12
// An accent is only put where it brings the colour this much closer: a few clear shapes, not a
// tint over half the picture.
const ACCENT_COAT_PRICE = 3
// Spots (wash result and picture colour) the accents are chosen on: the worst ones.
const ACCENT_SPOTS = 1500
// An accent covers at most this part of the picture.
const ACCENT_SHARE = 0.2
// Accents are chosen by the squared distance they take away, so that one bad miss counts for more
// than many small ones, with the weight of a colour = (its pixel count) ^ DETAIL_POWER, so that
// small parts count for more than their area. An accent is used when it lowers the mean squared
// distance weighted like that by ACCENT_PRICE.
const DETAIL_POWER = 0.65
const ACCENT_PRICE = 0.5
// For the accent that brings back a missing colour, a miss counts by the chroma of the picture
// there (times chroma / COLOUR_CHROMA), and a miss in lightness counts COLOUR_LIGHTNESS of one in
// hue or saturation: a small bright yellow is then worth as much as a much larger dark.
const COLOUR_CHROMA = 0.1
const COLOUR_LIGHTNESS = 0.5
// The accent for the darks is dark: one coat of it on white paper is darker than DARK_COAT
// (OKLab lightness), or there is none. It goes on parts of the picture darker than DARK_FROM
// (layers.js), and a miss counts by how dark the picture is there, fully below DARK_FULL.
const DARK_COAT = 0.45
const DARK_FULL = 0.3


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
    const clean = dulling(a, b)
    topD.fill(Infinity)
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d = Math.sqrt(dL * dL + da * da + db * db) + combos.work[p] + clean * combos.dull[p]
      if (d < topD[T - 1]) {
        let s = T - 1
        while (s > 0 && topD[s - 1] > d) { topD[s] = topD[s - 1]; topI[s] = topI[s - 1]; s-- }
        topD[s] = d; topI[s] = p
      }
    }
    for (let s = 0; s < T; s++) {
      const o = (i * T + s) * 3, p = topI[s] * 3
      base[o] = lin[p]; base[o + 1] = lin[p + 1]; base[o + 2] = lin[p + 2]
      work[i * T + s] = combos.work[topI[s]] + clean * combos.dull[topI[s]]
    }
  }
  return { base, work, T }
}

// Weighted mean of distance plus work of the colours when one more wash layer is laid over their
// shortlisted combinations. Gives up as soon as the sum passes `bound` (the best so far).
// `dull` = what a coat of this layer costs extra on a saturated colour.
const scratch = new Float64Array(3)
function errorWith(table, { base, work, T }, points, weights, n, bound = Infinity, dull = 0) {
  const levels = table.length / 3
  let sum = 0
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    const coat = (COAT_PRICE + (dull ? dulling(a, b) * dull : 0)) / 100
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

const NO_LAYER = new Float64Array([1, 1, 1])

// Amount of an accent's paint that its wash layer has already put on the paper (all its coats).
function underOf(layer, chosen) {
  if (layer.kind !== 'accent') return 0
  const wash = chosen.find((l) => l.kind === 'wash' && l.paint === layer.paint)
  return wash ? coatAmount(wash.top, wash.strength, wash.ratio) : 0
}

const tablesOf = (chosen) => chosen.map((layer) => filterTable(layer.A, layer.limit, layer.strength, layer.ratio, layer.top, underOf(layer, chosen)))
const pricesOf = (chosen) => chosen.map((layer) => ({ coat: layer.kind === 'accent' ? ACCENT_COAT_PRICE : COAT_PRICE, dull: layer.dull }))

// A paint as the search knows it. `dull` = what a coat of it costs extra on a saturated colour.
function knownPaint(paint) {
  const A = absorbanceFromHex(paint.hex)
  const [r, g, b] = rgbToLinear(hexToRgb(paint.hex))
  writeLab(r, g, b, scratch, 0)
  const neutral = Math.max(0, 1 - Math.hypot(scratch[1], scratch[2]) / NEUTRAL_CHROMA)
  return { paint, A, limit: depthLimit(A), dull: neutral * DULL_PRICE }
}
const paintsOf = (chosen) => new Set(chosen.map((layer) => layer.paint))

// Plan the wash layers: which paints, with how many coats of which wash.
// The search can get stuck, and graded coats give it more room to do so: with `graded` it runs
// once with even coats and once with graded ones, and the cheaper plan (distance plus work) counts.
function planWashes(set, paints, options) {
  const maxRatio = options.graded && options.maxCoats > 1 ? MAX_RATIO : 1
  let best = null
  // Adding one paint at a time, the last paint can pay for itself where a plan with one paint
  // less, found on its own, does as well with fewer steps. So that plan is looked at too.
  const counts = options.start || options.count < 3 ? [options.count] : [options.count, options.count - 1]
  const starts = maxRatio > 1 && !options.start ? [[1], RATIOS] : [maxRatio > 1 ? RATIOS : [1]]
  for (const [count, ratios] of counts.flatMap((c) => starts.map((r) => [c, r]))) {
    let chosen = searchWashes(set, paints, { ...options, count, ratios, maxRatio })
    let sum = planCost(chosen, set)
    // The search judges a step by a shortcut. Counted exactly, with every colour free to choose
    // among all combinations, a coat or a whole layer may not pay after all: it goes.
    for (let pruned = true; pruned && chosen.length > 1; ) {
      pruned = false
      for (let k = 0; k < chosen.length; k++) {
        const less = chosen.map((layer, i) => (i === k ? { ...layer, top: layer.top - 1 } : layer)).filter((layer) => layer.top > 0)
        const cost = planCost(less, set)
        if (cost <= sum + 1e-9) { chosen = less; sum = cost; pruned = true; break }
      }
    }
    if (!best || sum < best.sum - 1e-9) best = { chosen, sum }
  }
  return best.chosen
}

// What a plan of washes costs: the mean distance of the colours, each with the combination that
// suits it best, plus the work in those combinations, plus the steps.
function planCost(chosen, set) {
  const combos = combinations(tablesOf(chosen), pricesOf(chosen))
  const { best, error } = closest(combos, set.points, set.n)
  let sum = chosen.reduce((steps, layer) => steps + layer.top, 0) * STEP_PRICE
  for (let i = 0; i < set.n; i++) {
    const clean = dulling(set.points[i * 3 + 1], set.points[i * 3 + 2])
    sum += (set.weights[i] / 100) * (error[i] + (combos.work[best[i]] + clean * combos.dull[best[i]]) * 100)
  }
  return sum
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
    const known = knownPaint(paint)
    return { ...known, tables: grid.map((w) => filterTable(known.A, known.limit, w.strength, w.ratio, maxCoats)) }
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
          const cost = errorWith(candidate.tables[g].subarray(0, (top + 1) * 3), rest, points, weights, n, bound - steps, candidate.dull) + steps
          if (cost < bound) { bound = cost; best = { paint: candidate.paint, A: candidate.A, limit: candidate.limit, dull: candidate.dull, ...grid[g], top, kind: 'wash' } }
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
        const now = errorWith(tablesOf(chosen)[k], rest, points, weights, n, Infinity, chosen[k].dull) + STEP_PRICE * chosen[k].top
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
        const errorAt = (top) => ([s, r]) => errorWith(filterTable(layer.A, layer.limit, s, r, top), rest, points, weights, n, Infinity, layer.dull) + STEP_PRICE * top
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
function residual({ base, points, counts }) {
  const all = counts.length
  let total = 0, totalDetail = 0
  for (let i = 0; i < all; i++) { total += counts[i]; totalDetail += Math.pow(counts[i], DETAIL_POWER) }
  const lab = new Float64Array(3)
  const kept = []
  for (let i = 0; i < all; i++) {
    writeLab(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], lab, 0)
    const miss = Math.hypot(lab[0] - points[i * 3], lab[1] - points[i * 3 + 1], lab[2] - points[i * 3 + 2])
    if (miss * 100 <= ACCENT_COAT_PRICE) continue
    const chroma = Math.hypot(points[i * 3 + 1], points[i * 3 + 2])
    kept.push({ i, rank: Math.pow(counts[i], DETAIL_POWER) * miss * miss * (1 + chroma / COLOUR_CHROMA) })
  }
  kept.sort((x, y) => y.rank - x.rank || x.i - y.i)
  const n = Math.min(kept.length, ACCENT_SPOTS)
  const out = { n, base: new Float64Array(n * 3), points: new Float64Array(n * 3), weights: new Float64Array(n), detail: new Float64Array(n) }
  for (let j = 0; j < n; j++) {
    const i = kept[j].i
    for (let c = 0; c < 3; c++) { out.base[j * 3 + c] = base[i * 3 + c]; out.points[j * 3 + c] = points[i * 3 + c] }
    out.weights[j] = (counts[i] / total) * 100
    out.detail[j] = (Math.pow(counts[i], DETAIL_POWER) / totalDetail) * 100
  }
  return out
}

// What an accent is good for on what the washes leave over: the squared distance (its work
// included) it takes away, weighted by `detail`, and the part of the picture (of 100) it would be
// painted on. A spot takes the accent over its washes or, when that is clearly closer, on bare
// paper (a shape the painter leaves out of the washes). With `apply` the spots get it.
// `role` says what counts as a miss:
// - 'colour': a colour of the picture that is missing. Misses count by the chroma of the picture
//   and by how much of that colour the washes lack (a hue that is not there at all counts fully,
//   one that is only too pale hardly), lightness counts less, and the accent must bring hue and
//   saturation closer. The dark parts of the picture are left to the accent for the darks.
// - 'dark': a dark part that comes out too light. Misses count by how dark the picture is there.
// - 'any': every miss, saturated ones more.
function accentGain(candidate, table, spots, role, apply = false) {
  const { base, points, weights, detail, n } = spots
  const lightness = role === 'colour' ? COLOUR_LIGHTNESS : 1
  const coat = ACCENT_COAT_PRICE / 100, carve = CARVE_GAIN / 100
  writeLab(table[3], table[4], table[5], scratch, 0)
  const aloneL = scratch[0], aloneA = scratch[1], aloneB = scratch[2]
  let gain = 0, share = 0
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const L = points[o], a = points[o + 1], b = points[o + 2]
    const chroma = Math.sqrt(a * a + b * b)
    const price = coat + (candidate.dull ? (dulling(a, b) * candidate.dull) / 100 : 0)
    writeLab(base[o], base[o + 1], base[o + 2], scratch, 0)
    const baseL = scratch[0]
    const offHue = Math.hypot(scratch[1] - a, scratch[2] - b)
    // How much of the picture's colour is not there yet: 0 = the washes have its hue at full
    // saturation, 1 = they have nothing of it.
    const missing = chroma > 0 ? Math.min(1, Math.max(0, 1 - (scratch[1] * a + scratch[2] * b) / (chroma * chroma))) : 0
    const without = Math.hypot((baseL - L) * lightness, scratch[1] - a, scratch[2] - b)
    writeLab(base[o] * table[3], base[o + 1] * table[4], base[o + 2] * table[5], scratch, 0)
    let withIt = Math.hypot((scratch[0] - L) * lightness, scratch[1] - a, scratch[2] - b) + price
    let onHue = Math.hypot(scratch[1] - a, scratch[2] - b)
    const alone = Math.hypot((aloneL - L) * lightness, aloneA - a, aloneB - b) + price + carve
    const reserved = role !== 'dark' && alone < withIt
    if (reserved) { withIt = alone; onHue = Math.hypot(aloneA - a, aloneB - b) }
    if (withIt >= without) continue
    let weight = detail[i]
    if (role === 'colour') {
      if (onHue >= offHue || chroma < COLOUR_CHROMA / 2 || L < DARK_FROM) continue
      weight *= (chroma / COLOUR_CHROMA) * missing
    } else if (role === 'dark') {
      if (L >= baseL || L >= DARK_FROM) continue
      weight *= Math.min(1, (DARK_FROM - L) / (DARK_FROM - DARK_FULL))
    } else weight *= 1 + chroma / COLOUR_CHROMA
    gain += weight * (without * without - withIt * withIt) * 100
    share += weights[i]
    if (apply) {
      if (reserved) { base[o] = table[3]; base[o + 1] = table[4]; base[o + 2] = table[5] }
      else { base[o] *= table[3]; base[o + 1] *= table[4]; base[o + 2] *= table[5] }
    }
  }
  return { gain, share }
}

// Whether one coat of this wash on white paper is dark enough for the accent for the darks.
function darkCoat(candidate, strength) {
  const d = depth(strength, candidate.limit)
  writeLab(Math.exp(-d * candidate.A[0]), Math.exp(-d * candidate.A[1]), Math.exp(-d * candidate.A[2]), scratch, 0)
  return scratch[0] < DARK_COAT
}

// The accents: one strong wash at a time, of the paint and strength that take most away from what
// is left over, as long as one pays. The first is for a colour of the picture that is missing,
// the second for the darks, a third for whatever is missed most; a role nothing pays for is
// passed over, and when no paint is dark enough there is no accent for the darks. So with more
// accents allowed the first ones stay the same.
function chooseAccents(washes, spots, paints, count) {
  const chosen = []
  const pool = paints.map((paint) => {
    const wash = washes.find((layer) => layer.paint === paint)
    return { ...knownPaint(paint), under: wash ? coatAmount(wash.top, wash.strength, wash.ratio) : 0 }
  })
  const tableOf = (candidate, strength) => filterTable(candidate.A, candidate.limit, strength, 1, 1, candidate.under)
  let size = washes.reduce((s, layer) => s * (layer.top + 1), 1)
  for (const role of ['colour', 'dark', 'any']) {
    if (chosen.length >= count || !spots.n || size * 2 > MAX_COMBINATIONS) break
    const gainOf = (candidate, strength) => {
      if (role === 'dark' && !darkCoat(candidate, strength)) return 0
      const { gain, share } = accentGain(candidate, tableOf(candidate, strength), spots, role)
      return share > ACCENT_SHARE * 100 ? 0 : gain
    }
    let best = null, most = ACCENT_PRICE
    for (const candidate of pool) {
      if (chosen.some((layer) => layer.paint === candidate.paint)) continue
      for (const strength of ACCENT_STRENGTHS) {
        const gain = gainOf(candidate, strength)
        if (gain > most) { most = gain; best = { candidate, strength } }
      }
    }
    if (!best) continue
    // The strength between the ones tried that takes most away.
    let { candidate, strength } = best
    for (let step = 0.25; step > 0.02; step /= 2) {
      for (const dir of [1, -1]) {
        const trial = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength * Math.exp(dir * step)))
        const gain = gainOf(candidate, trial)
        if (gain > most) { most = gain; strength = trial }
      }
    }
    accentGain(candidate, tableOf(candidate, strength), spots, role, true)
    chosen.push({ paint: candidate.paint, A: candidate.A, limit: candidate.limit, dull: candidate.dull, strength, ratio: 1, top: 1, kind: 'accent', role })
    size *= 2
  }
  return chosen
}

// The whole plan: the washes, then accents for what they leave over. The washes do not depend on
// the accents, so more accents only ever add to a plan.
// `left(washes)` gives what the washes leave over (see `residual`).
function planLayers(set, left, paints, { count, maxCoats, graded, accents }) {
  const washes = planWashes(set, paints, { count: Math.min(count, paints.length, MAX_LAYERS), maxCoats, graded })
  const extra = Math.min(3, Math.max(0, Math.round(accents)))
  return extra ? [...washes, ...chooseAccents(washes, residual(left(washes)), paints, extra)] : washes
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

// Painting order: the washes of clean colour, lightest first (OKLab lightness of the layer with
// all its coats on), then the washes of neutral paints, which a painter keeps for late, then the
// accents, lightest first.
function paintingOrder(chosen) {
  const lab = new Float64Array(3)
  const tables = tablesOf(chosen)
  return chosen
    .map((layer, i) => {
      const o = layer.top * 3
      writeLab(tables[i][o], tables[i][o + 1], tables[i][o + 2], lab, 0)
      return { layer, table: tables[i], under: underOf(layer, chosen), late: layer.kind === 'accent' ? 2 : layer.dull > DULL_PRICE / 2 ? 1 : 0, L: lab[0], i }
    })
    .sort((x, y) => x.late - y.late || y.L - x.L || x.i - y.i)
}

// The layers as they are handed out, and their filter tables with the coats each layer really
// has. The arrays that are handed out all run to maxCoats (the last coat repeated), so that every
// layer can be asked for any number of coats. Paints without a layer are listed last, unused.
function describeLayers(chosen, unused, maxCoats) {
  const ordered = paintingOrder(chosen)
  for (const paint of unused) ordered.push({ layer: { paint, strength: 0, ratio: 1, top: 0, kind: 'wash', limit: 1, dull: 0 }, table: NO_LAYER, under: 0 })
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
      ...(layer.role ? { role: layer.role } : {}),
      paintId: layer.paint.id,
      top: layer.top,
      ...washAt(0),
      ratio: layer.ratio,
      washes: Array.from({ length: maxCoats }, (_, c) => washAt(c)),
      depths: Array.from({ length: maxCoats + 1 }, (_, c) => depth(under + coatAmount(Math.min(c, layer.top), layer.strength, layer.ratio), layer.limit) - depth(under, layer.limit)),
      // Of an accent over its own wash paint, `filters` is what it adds there; the colour to
      // prepare and to test on white paper is that of the wash by itself.
      hexes: under ? ['#ffffff', ...Array.from({ length: maxCoats }, () => linearHex(filterTable(layer.A, layer.limit, layer.strength, 1, 1), 3))] : Array.from({ length: maxCoats + 1 }, (_, c) => linearHex(filters, c * 3)),
      filters,
    }
  })
  return { layers, tables: ordered.map((o) => o.table), prices: pricesOf(ordered.map((o) => o.layer)) }
}

// From the colours to the layers, in painting order. `left` as in `planLayers`; without it the
// accents are fitted to the same colours as the washes.
function layersFor(colours, paints, { count, maxCoats, graded, accents, keepUnused, left }) {
  if (!paints.length || !colours.counts.length) return describeLayers([], keepUnused ? paints : [], maxCoats)
  const chosen = planLayers(fitSet(colours), left ?? leftOfColours(colours), paints, { count, maxCoats, graded, accents })
  return describeLayers(chosen, keepUnused ? paints.filter((p) => !chosen.some((l) => l.paint === p)) : [], maxCoats)
}

/**
 * Propose the base paints for a set of colours.
 * @param {{points: Float64Array, counts: Float64Array}} colours  from `pictureColours` or `colourSet`
 * @param {Array<{id:string, hex:string}>} paints  paints to choose from
 * @param {{count?: number, maxCoats?: number, graded?: boolean, accents?: number}} options
 *   count = the most paints to propose for the washes; fewer come back when the rest would not
 *   pay for its work.
 *   graded = coats of a layer may get stronger from coat to coat.
 *   accents 0..3 = the most accent layers (default 2): the first for a colour of the picture the
 *   washes miss, the second for the darks, a third for whatever is missed most. One that does
 *   not pay is not used. An accent may bring a paint of its own, on top of `count`. The washes
 *   are the same whatever `accents` is.
 *   From the colours alone the accents can only be guessed; `layerImage` proposes from the picture.
 * @returns {string[]} paint ids in painting order: washes, then paints only used for accents
 */
export function proposeLayerPaints(colours, paints, { count = 4, maxCoats = MAX_COATS, graded = GRADED, accents = ACCENTS } = {}) {
  return unique(layersFor(colours, paints, { count, maxCoats: Math.max(1, maxCoats), graded, accents }).layers.map((layer) => layer.paintId))
}

/**
 * @typedef {Object} Layer
 * @property {number} index        place in the painting order, 0 = first
 * @property {'wash'|'accent'} kind  wash = broad, up to maxCoats coats; accent = one strong coat on small parts, painted after all washes
 * @property {'colour'|'dark'|'any'} [role]  of an accent: what it is for (a missing colour, the darks, whatever is missed most)
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
 * @param {{maxCoats?: number, graded?: boolean, accents?: number}} options  see `proposeLayerPaints`
 * @returns {{layers: Layer[], coats: number[][], hexes: string[], deltaE: number[], error: number}}
 *   layers = in painting order, paints that are not used last (top 0); a paint can have two
 *   layers, a wash and an accent. coats[i][k] = coats of layer k for colour i; hexes[i] = the
 *   colour those coats give; deltaE[i] = its distance to colour i; error = mean deltaE weighted by count
 */
export function fitLayers(colours, paints, { maxCoats = MAX_COATS, graded = GRADED, accents = ACCENTS } = {}) {
  const n = colours.counts.length
  const { layers, tables, prices } = layersFor(colours, paints, { count: paints.length, maxCoats: Math.max(1, maxCoats), graded, accents, keepUnused: true })
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

// What the washes leave over of the picture, from the pairs the browser counted (see `leftOf` in
// layerImage): every pair (colour of `colours`, cell of the coarse grid) gets the washes that
// suit its colour best and keeps the colour of its cell; pairs alike in both are counted together.
function leftOfPairs(colours, { cells, pairs }) {
  const nc = cells.length / 3
  return (washes) => {
    const combos = combinations(tablesOf(washes), pricesOf(washes))
    const { best } = closest(combos, colours.points, colours.counts.length)
    const seen = new Map()
    for (let i = 0; i < pairs.length; i += 3) {
      const key = best[pairs[i]] * nc + pairs[i + 1]
      seen.set(key, (seen.get(key) ?? 0) + pairs[i + 2])
    }
    const base = new Float64Array(seen.size * 3), points = new Float64Array(seen.size * 3), counts = new Float64Array(seen.size)
    let i = 0
    for (const [key, n] of seen) {
      const cell = key % nc, combo = (key - cell) / nc
      base.set(combos.lin.subarray(combo * 3, combo * 3 + 3), i * 3)
      for (let c = 0; c < 3; c++) points[i * 3 + c] = cells[cell * 3 + c]
      counts[i++] = n
    }
    return { base, points, counts }
  }
}

/**
 * The plan of the layers for the colours of a picture: what `api/mix/layers` answers.
 * @param {{colours: {points: number[], counts: number[]}, left: ({cells: number[], pairs: number[]}|null),
 *   paints: Array<{id:string, hex:string}>, count: number, maxCoats: number, graded: boolean, accents: number,
 *   keepUnused: boolean}} request  colours = OKLab triples and pixel counts; left = what the
 *   accents are fitted to (see `leftOfPairs`), null without accents
 * @returns {{layers: Array<Layer>, tables: number[][], prices: Array<{coat:number, dull:number}>}}
 *   layers in painting order (filters as plain arrays), tables = the filter of every layer per
 *   number of coats it really has, prices = what a coat of each layer costs
 */
export function planLayersFor({ colours, left, paints, count, maxCoats, graded, accents, keepUnused }) {
  const plan = layersFor(colours, paints, {
    count,
    maxCoats: Math.max(1, maxCoats),
    graded: !!graded,
    accents,
    keepUnused: !!keepUnused,
    left: left ? leftOfPairs(colours, left) : undefined,
  })
  return {
    layers: plan.layers.map((layer) => ({ ...layer, filters: Array.from(layer.filters) })),
    tables: plan.tables.map((t) => Array.from(t)),
    prices: plan.prices,
  }
}
