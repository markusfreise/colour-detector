// Subtractive watercolour mixing.
//
// Model: paints mix like filters over white paper (Beer–Lambert), water thins the mix like
// opacity. Each paint's swatch colour gives a per-channel absorbance A = -ln(reflectance).
// A mix with amounts a_i is first taken at full strength, its largest amount (its fullness f)
// raised to 1: that mix reflects exp(-d(S)/S · Σ a_i·A_i) with S = Σ a_i. The wash is that
// colour laid over the paper at opacity f, in sRGB: an M wash at fullness 0.5 is the full mix
// at 50 % (decided 2026-10-18; until then water only scaled the absorbance, which kept a paint
// with an empty channel, like cobalt turquoise without red, vivid at every dilution).
// An amount of 1 means "as strong as the reference swatch"; smaller amounts mean more water.
// No paint counts for more than 1 (MAX_AMOUNT): a paint is never darker than its swatch.
//
// d(S) is the depth a wash reaches with the total amount S of paint in it. It is 1 at
// amount 1 and levels off at MAX_DEPTH, which matters for a mix of several paints (S above 1):
// their depths do not simply add up.
// The limit holds for the mix as a whole, not for each paint: a brush only carries so much
// pigment, so three bright paints together do not add up to black. Watery mixes still add
// up paint by paint.
// How deep a paint can go depends on the paint: blacks, greys and earths have a masstone far
// darker than their wash, bright paints do not. The limit of a mix is the limit of its paints,
// weighted by their amounts.
//
// Finding a recipe starts from a non-negative least-squares fit in absorbance space, which gives
// the proportions; the water is then fitted and the amounts refined perceptually (OKLab).

import { hexToRgb, rgbToLinear, linearToRgb, rgbToHex, linearToOklab, deltaE, srgbToLinear, linearToSrgb } from './color.js'

const MIN_REFLECTANCE = 0.0005
// The most of one paint in a mix or on the paper: the paint as its swatch shows it. Water only
// makes a paint lighter, so nothing is ever darker than the swatch of a paint unless a second
// paint is mixed in or laid over it (decided 2026-10-12; until then four times as much was
// allowed, on the way to an estimated masstone).
export const MAX_AMOUNT = 1
// Where the water levels of a wash begin, as fullness: paper, W, L, M, R, C, and the swatch itself.
const WASH_LIMITS = [0.02, 0.1, 0.25, 0.5, 0.8, 1]
// Depth of the masstone relative to the reference swatch, for a bright paint and for a neutral
// one. Estimates: the stock data holds one colour per paint, not its masstone.
export const MAX_DEPTH = 1.6
export const MAX_DEPTH_NEUTRAL = 4
// OKLab chroma from which a paint counts as fully bright.
const BRIGHT_CHROMA = 0.15

const limits = new WeakMap()

/** How deep the paint with this absorbance can go: MAX_DEPTH for a bright paint, more the greyer it is. */
export function depthLimit(A) {
  let limit = limits.get(A)
  if (limit === undefined) {
    const [, a, b] = linearToOklab(A.map((v) => Math.exp(-v)))
    const grey = Math.max(0, 1 - Math.hypot(a, b) / BRIGHT_CHROMA)
    limit = MAX_DEPTH + (MAX_DEPTH_NEUTRAL - MAX_DEPTH) * grey
    limits.set(A, limit)
  }
  return limit
}

/** Depth reached with the given total amount of paint: 0 at 0, 1 at 1, `limit` for a thick layer. */
export function depth(amount, limit = MAX_DEPTH) {
  return limit * (1 - Math.pow(1 - 1 / limit, amount))
}

// Total amount needed for a depth; depths that cannot be reached give `most`, the largest amount.
function amountForDepth(d, limit, most = MAX_AMOUNT) {
  return d >= depth(most, limit) ? most : Math.log(1 - d / limit) / Math.log(1 - 1 / limit)
}
// Each extra paint in a recipe must buy at least this much ΔE to be preferred.
const EXTRA_PAINT_PENALTY = 1.2

export function absorbanceFromHex(hex) {
  return rgbToLinear(hexToRgb(hex)).map((v) => -Math.log(Math.min(1, Math.max(MIN_REFLECTANCE, v))))
}

export function mixAbsorbances(absorbances, amounts) {
  const total = [0, 0, 0]
  let sum = 0
  let limit = 0
  // No paint counts for more than its swatch (MAX_AMOUNT), whatever amount is asked for.
  const capped = amounts.map((v) => Math.max(0, Math.min(MAX_AMOUNT, v)))
  const fullness = Math.max(0, ...capped)
  if (!(fullness > 0)) return [1, 1, 1]
  // The mix at full strength; the water comes in below, as opacity.
  const used = capped.map((v) => v / fullness)
  absorbances.forEach((A, i) => {
    sum += used[i]
    limit += used[i] * depthLimit(A)
  })
  // Every paint contributes by its share of the depth the whole mix reaches.
  const scale = sum > 0 ? depth(sum, limit / sum) / sum : 0
  absorbances.forEach((A, i) => {
    const d = used[i] * scale
    total[0] += A[0] * d
    total[1] += A[1] * d
    total[2] += A[2] * d
  })
  return total.map((v) => thinned(Math.exp(-v), fullness))
}

// A reflectance (linear) laid over white paper at that opacity, blended in sRGB.
const thinned = (reflectance, opacity) => srgbToLinear(255 - opacity * (255 - linearToSrgb(reflectance)))

/** One paint alone on white paper at that amount (capped at MAX_AMOUNT): its swatch at that opacity, linear RGB. */
export function paintFilter(A, amount) {
  const a = Math.max(0, Math.min(MAX_AMOUNT, amount))
  return A.map((v) => thinned(Math.exp(-v), a))
}

/** Predicted colour (hex) of mixing the given paints with the given amounts on white paper. */
export function mixHex(paints, amounts) {
  const linear = mixAbsorbances(paints.map((p) => absorbanceFromHex(p.hex)), amounts)
  return rgbToHex(linearToRgb(linear))
}

// Solve the 3×k least-squares system M·a ≈ t via normal equations (k ≤ 3).
function leastSquares(columns, t) {
  const k = columns.length
  const G = Array.from({ length: k }, (_, i) => columns.map((c) => dot(columns[i], c)))
  const h = columns.map((c) => dot(c, t))
  return solve(G, h)
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-10) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function* combinations(items, size, start = 0, prefix = []) {
  if (prefix.length === size) {
    yield prefix
    return
  }
  for (let i = start; i < items.length; i++) yield* combinations(items, size, i + 1, [...prefix, items[i]])
}

// How far a mix is from a target. With `values` only its lightness counts (see `valueRecipes`).
function evaluate(candidate, amounts, targetLab, values = false) {
  const lab = linearToOklab(mixAbsorbances(candidate.map((c) => c.A), amounts))
  return values ? Math.abs(lab[0] - targetLab[0]) * 100 : deltaE(lab, targetLab)
}

// Value mode: among the mixes that reach a value, the one that needs least change in water wins;
// every factor e of more or less water than the mix's own strength counts as this much error.
export const VALUE_WATER_PENALTY = 2
// Value mode: the proportions a mix of two is tried in; three paints are tried in equal parts,
// and only while the paint box is small enough to try every three of them.
const VALUE_PAIR_PARTS = [[1, 1], [2, 1], [1, 2]]
const VALUE_TRIPLES_UP_TO = 12

// The mixes of value mode: every paint, every two and three of them in their proportions. Each
// with its amounts and its lightness (OKLab) at a strength of e^logT times that of one paint,
// and `most`, the logT at which its largest amount is as much as a recipe takes.
function* valueMixes(paints, maxPaints) {
  const pool = paints.map((paint) => ({ paint, A: absorbanceFromHex(paint.hex) }))
  const mix = (candidate, parts) => {
    const whole = parts.reduce((sum, v) => sum + v, 0)
    const base = parts.map((v) => v / whole)
    const amountsAt = (logT) => base.map((v) => v * Math.exp(logT))
    const lightness = (logT) => linearToOklab(mixAbsorbances(candidate.map((c) => c.A), amountsAt(logT)))[0]
    return { candidate, amountsAt, lightness, most: Math.log(MAX_AMOUNT / Math.max(...base)) }
  }
  for (const c of pool) yield mix([c], [1])
  if (maxPaints >= 2) for (const pair of combinations(pool, 2)) for (const parts of VALUE_PAIR_PARTS) yield mix(pair, parts)
  if (maxPaints >= 3 && pool.length <= VALUE_TRIPLES_UP_TO) for (const triple of combinations(pool, 3)) yield mix(triple, [1, 1, 1])
}

/**
 * Value mode: the darkest the paints reach, alone or mixed, as lightness in OKLab (1 = paper,
 * which is also the answer without paints). A yellow alone stays light; the values of a picture
 * that go deeper have to be brought into what the paints reach before they are matched.
 */
export function valueReach(paints, { maxPaints = 3 } = {}) {
  let darkest = 1
  for (const { lightness, most } of valueMixes(paints, maxPaints)) darkest = Math.min(darkest, lightness(most))
  return darkest
}

/**
 * Value mode: the picture is grey, and the paints and their mixes stand for its values, whatever
 * their hue. Every paint, every two (and three) of them in a few plain proportions is a mix with
 * a value of its own; each is given as much water as brings it to the lightness of the target,
 * and the mix whose own strength is closest to that wins. So a yellow takes the lights, a mix of
 * two darks the darks, and what lies between is built from the rest.
 * `deltaE` of a recipe is then the difference in lightness alone.
 */
function valueRecipes(targetLab, paints, { maxPaints, limit }) {
  const paper = Math.abs(1 - targetLab[0]) * 100
  const results = [{ items: [], deltaE: paper, score: paper }]
  for (const { candidate, amountsAt, lightness, most } of valueMixes(paints, maxPaints)) {
    // More paint is darker: the water with the lightness of the target, or the end that comes closest.
    let lo = Math.log(0.02), hi = most
    if (lightness(lo) <= targetLab[0]) hi = lo
    else if (lightness(hi) >= targetLab[0]) lo = hi
    else {
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2
        if (lightness(mid) > targetLab[0]) lo = mid
        else hi = mid
      }
    }
    const logT = (lo + hi) / 2
    const amounts = amountsAt(logT)
    const err = evaluate(candidate, amounts, targetLab, true)
    results.push({
      items: candidate.map((c, i) => ({ paint: c.paint, amount: amounts[i] })),
      deltaE: err,
      score: err + VALUE_WATER_PENALTY * Math.abs(logT) + EXTRA_PAINT_PENALTY * (candidate.length - 1),
    })
  }
  // The best proportion of every set of paints.
  const seen = new Set()
  return results
    .sort((x, y) => x.score - y.score)
    .filter((r) => {
      const key = r.items.map((it) => it.paint.id).sort().join('+')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((r) => toRecipe(r))
}

// Pattern search on the amounts to minimise perceptual error.
function refine(candidate, amounts, targetLab) {
  let best = amounts.slice()
  let bestErr = evaluate(candidate, best, targetLab)
  let step = 0.25
  for (let iter = 0; iter < 40 && step > 0.005; iter++) {
    let improved = false
    for (let i = 0; i < best.length; i++) {
      for (const dir of [1, -1]) {
        const trial = best.slice()
        trial[i] = Math.min(MAX_AMOUNT, Math.max(0.01, trial[i] * (1 + dir * step) + dir * step * 0.05))
        const err = evaluate(candidate, trial, targetLab)
        if (err < bestErr) {
          best = trial
          bestErr = err
          improved = true
        }
      }
    }
    if (!improved) step /= 2
  }
  return { amounts: best, deltaE: bestErr }
}

/**
 * Find the best watercolour recipes for a target colour.
 * @param {string} targetHex
 * @param {Array<{id:string, hex:string}>} paints  available paints
 * @param {{maxPaints?: number, limit?: number, values?: boolean}} options  values = value mode:
 *   paints and their mixes matched by lightness alone (`valueRecipes`)
 * @returns {Array<Recipe>} sorted best-first
 */
export function findRecipes(targetHex, paints, { maxPaints = 3, limit = 5, values = false } = {}) {
  const targetLinear = rgbToLinear(hexToRgb(targetHex))
  const targetLab = linearToOklab(targetLinear)
  if (values) return valueRecipes(targetLab, paints, { maxPaints, limit })
  const T = targetLinear.map((v) => -Math.log(Math.min(1, Math.max(MIN_REFLECTANCE, v))))
  const paperLab = linearToOklab([1, 1, 1])

  const results = []
  // Plain paper is a legitimate answer for near-white targets.
  results.push({ items: [], deltaE: deltaE(paperLab, targetLab) })

  if (paints.length) {
    const pool = paints.map((p) => ({ paint: p, A: absorbanceFromHex(p.hex) }))
    const consider = (candidate) => {
      const a = leastSquares(candidate.map((c) => c.A), T)
      if (!a || a.some((v) => !(v > 0))) return
      // The least-squares solution is in depths, which add up to the depth of the whole mix:
      // find the total amount for that depth and share it out in the same proportions.
      const reach = a.reduce((s, v) => s + v, 0)
      const limit = candidate.reduce((s, c, i) => s + a[i] * depthLimit(c.A), 0) / reach
      const sum = amountForDepth(reach, limit, candidate.length * MAX_AMOUNT)
      let amounts = a.map((v) => (v * sum) / reach)
      // With the proportions kept, no paint above its swatch.
      const most = Math.max(...amounts)
      if (most > MAX_AMOUNT) amounts = amounts.map((v) => (v * MAX_AMOUNT) / most)
      // The fit is in absorbance, where water is not: it gives the proportions, the water is fitted here.
      const fitted = fitWater(candidate, amounts, targetLab, { steps: 12, fine: false })
      results.push({ candidate, amounts: fitted.amounts, deltaE: fitted.deltaE })
    }

    for (const c of pool) consider([c])
    if (maxPaints >= 2) for (const pair of combinations(pool, 2)) consider(pair)
    if (maxPaints >= 3) {
      // Triples only among paints that already performed well, to keep it fast.
      const shortlist = new Set()
      results
        .slice()
        .sort((x, y) => x.deltaE - y.deltaE)
        .slice(0, 30)
        .forEach((r) => r.candidate?.forEach((c) => shortlist.add(c.paint.id)))
      const short = pool.filter((c) => shortlist.has(c.paint.id)).slice(0, 14)
      for (const triple of combinations(short, 3)) consider(triple)
    }
  }

  // Perceptual refinement is the expensive part: only do it for the most promising candidates.
  results.sort((x, y) => x.deltaE - y.deltaE)
  results.forEach((r, i) => {
    if (r.candidate && i < 40) {
      const refined = refine(r.candidate, r.amounts, targetLab)
      r.amounts = refined.amounts
      r.deltaE = refined.deltaE
    }
    r.items = r.candidate ? r.candidate.map((c, j) => ({ paint: c.paint, amount: r.amounts[j] })) : r.items
  })

  const score = (r) => r.deltaE + EXTRA_PAINT_PENALTY * Math.max(0, r.items.length - 1)
  const seen = new Set()
  return results
    .sort((x, y) => score(x) - score(y))
    .filter((r) => {
      const key = r.items.map((it) => it.paint.id).sort().join('+')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((r) => toRecipe(r))
}

/**
 * Propose a small set of paints that mixes all the given target colours.
 * Works through the targets from the largest area down and, among the recipes that are
 * nearly as close as the best one, takes the recipe needing the fewest paints not chosen yet.
 * @param {Array<{hex:string, weight?:number}>} targets
 * @param {Array<{id:string, hex:string}>} paints  paints to choose from
 * @param {{maxPaints?: number, tolerance?: number, values?: boolean}} options  tolerance = allowed extra ΔE over the best recipe;
 *   values = value mode, as in `findRecipes`
 * @returns {string[]} paint ids
 */
export function proposePaints(targets, paints, { maxPaints = 3, tolerance = 2, values = false } = {}) {
  const chosen = new Set()
  const newPaints = (recipe) => recipe.paints.filter((p) => !chosen.has(p.paintId)).length
  const byWeight = [...targets].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  for (const target of byWeight) {
    const recipes = findRecipes(target.hex, paints, { maxPaints, limit: 8, values })
    if (!recipes.length) continue
    const best = Math.min(...recipes.map((r) => r.deltaE))
    const [pick] = recipes
      .filter((r) => r.deltaE <= best + tolerance)
      .sort((x, y) => newPaints(x) - newPaints(y) || x.deltaE - y.deltaE)
    pick.paints.forEach((p) => chosen.add(p.paintId))
  }
  return [...chosen]
}

/**
 * The same mix with more or less water: every amount scaled by one factor so the result
 * comes as close to the target as that mix can get.
 * @param {Recipe} recipe  the mix to dilute or strengthen
 * @param {string} targetHex
 * @param {Record<string, {id:string, hex:string}>} paintsById
 * @param {{values?: boolean}} options  values = value mode: as close in lightness as the mix can get
 * @returns {Recipe|null} null when the recipe has no paints (paper white)
 */
export function washRecipe(recipe, targetHex, paintsById, { values = false } = {}) {
  if (!recipe?.paints.length) return null
  const targetLab = linearToOklab(rgbToLinear(hexToRgb(targetHex)))
  const candidate = recipe.paints.map((p) => ({ paint: paintsById[p.paintId], A: absorbanceFromHex(paintsById[p.paintId].hex) }))
  const base = recipe.paints.map((p) => p.amount)
  const { amounts, deltaE: err } = fitWater(candidate, base, targetLab, { values })
  return toRecipe({ items: candidate.map((c, i) => ({ paint: c.paint, amount: amounts[i] })), deltaE: err })
}

/**
 * The amounts scaled by the one factor that brings the mix closest to the target: a coarse scan
 * over the water level, then (with `fine`) a golden-section search around the best step.
 */
function fitWater(candidate, base, targetLab, { values = false, steps = 48, fine = true } = {}) {
  const error = (logT) => evaluate(candidate, base.map((v) => v * Math.exp(logT)), targetLab, values)
  const lo = Math.log(0.02 / Math.max(...base))
  const hi = Math.log(MAX_AMOUNT / Math.max(...base))
  let best = lo, bestErr = Infinity
  for (let i = 0; i <= steps; i++) {
    const t = lo + ((hi - lo) * i) / steps
    const err = error(t)
    if (err < bestErr) { bestErr = err; best = t }
  }
  let logT = best
  if (fine) {
    let a = Math.max(lo, best - (hi - lo) / steps)
    let b = Math.min(hi, best + (hi - lo) / steps)
    const phi = (Math.sqrt(5) - 1) / 2
    for (let i = 0; i < 24; i++) {
      const c = b - (b - a) * phi
      const d = a + (b - a) * phi
      if (error(c) < error(d)) b = d
      else a = c
    }
    logT = (a + b) / 2
  }
  return { amounts: base.map((v) => v * Math.exp(logT)), deltaE: error(logT) }
}

function toRecipe({ items, deltaE: err }) {
  const strength = items.reduce((s, it) => s + it.amount, 0)
  // How little water: the largest amount of a paint, 1 = that paint as its swatch shows it.
  const fullness = items.reduce((most, it) => Math.max(most, it.amount), 0)
  const linear = mixAbsorbances(items.map((it) => absorbanceFromHex(it.paint.hex)), items.map((it) => it.amount))
  return {
    paints: items
      .map((it) => ({ paintId: it.paint.id, amount: it.amount, share: strength ? it.amount / strength : 0 }))
      .sort((a, b) => b.amount - a.amount),
    parts: toParts(items.map((it) => it.amount).sort((a, b) => b - a)),
    strength,
    fullness,
    dilution: describeDilution(fullness),
    hex: rgbToHex(linearToRgb(linear)),
    deltaE: err,
  }
}

/** Express amounts as simple ratio parts, e.g. [0.9, 0.3] -> [3, 1]. */
export function toParts(amounts) {
  if (!amounts.length) return []
  const min = Math.min(...amounts)
  const raw = amounts.map((a) => a / min)
  // Round to halves, cap the largest ratio so it stays practical on a palette.
  return raw.map((r) => Math.min(20, Math.round(r * 2) / 2))
}

/** The water of a wash in words. `fullness` = its paint with least water, 1 = as the swatch shows it. */
export function describeDilution(fullness) {
  if (fullness <= WASH_LIMITS[0]) return 'paper only'
  if (fullness < WASH_LIMITS[1]) return 'very watery wash'
  if (fullness < WASH_LIMITS[2]) return 'light wash'
  if (fullness < WASH_LIMITS[3]) return 'medium'
  if (fullness < WASH_LIMITS[4]) return 'rich'
  return 'concentrated (hardly any water)'
}

// Letter for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
export const WASH_LETTERS = [
  { letter: 'W', label: 'very watery' },
  { letter: 'L', label: 'light' },
  { letter: 'M', label: 'medium' },
  { letter: 'R', label: 'rich' },
  { letter: 'C', label: 'concentrated' },
]

// A value study needs more steps of water than five: with `fine` every level is split in this many.
const WASH_FINE = 5

/**
 * @param {number} strength  the fullness of a recipe (its paint with least water, at most 1)
 * @param {boolean} [fine]  the level and its step within it, W1 to C5 (value mode)
 */
export function washLetter(strength, fine = false) {
  if (strength <= WASH_LIMITS[0]) return ''
  let level = 0
  while (level < WASH_LETTERS.length - 1 && strength >= WASH_LIMITS[level + 1]) level++
  const { letter } = WASH_LETTERS[level]
  // Only on request: the function is also handed to `map`, whose index is no request.
  if (fine !== true) return letter
  // Steps of water are even on a log scale.
  const lo = Math.log(WASH_LIMITS[level]), hi = Math.log(WASH_LIMITS[level + 1])
  const step = Math.min(WASH_FINE - 1, Math.max(0, Math.floor(((Math.log(strength) - lo) / (hi - lo)) * WASH_FINE)))
  return `${letter}${step + 1}`
}

/** Match quality label for a ΔE (OKLab ×100) value. */
export function matchQuality(dE) {
  if (dE < 2) return 'excellent'
  if (dE < 5) return 'good'
  if (dE < 10) return 'fair'
  return 'rough'
}
