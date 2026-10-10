// Subtractive watercolour mixing.
//
// Model: transparent watercolour behaves roughly like a filter over white paper
// (Beer–Lambert). Each paint's swatch colour gives a per-channel absorbance
// A = -ln(reflectance). A mix of paints with amounts a_i reflects
// exp(-Σ a_i·A_i). An amount of 1 means "as strong as the reference swatch";
// smaller amounts mean more water, larger amounts mean a richer, darker layer.
//
// Finding a recipe is therefore a non-negative least-squares problem in
// absorbance space, followed by a small perceptual (OKLab) refinement.

import { hexToRgb, rgbToLinear, linearToRgb, rgbToHex, linearToOklab, deltaE } from './color.js'

const MIN_REFLECTANCE = 0.0005
const MAX_AMOUNT = 4
// Each extra paint in a recipe must buy at least this much ΔE to be preferred.
const EXTRA_PAINT_PENALTY = 1.2

export function absorbanceFromHex(hex) {
  return rgbToLinear(hexToRgb(hex)).map((v) => -Math.log(Math.min(1, Math.max(MIN_REFLECTANCE, v))))
}

export function mixAbsorbances(absorbances, amounts) {
  const total = [0, 0, 0]
  absorbances.forEach((A, i) => {
    total[0] += A[0] * amounts[i]
    total[1] += A[1] * amounts[i]
    total[2] += A[2] * amounts[i]
  })
  return total.map((v) => Math.exp(-v))
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

function evaluate(candidate, amounts, targetLab) {
  const linear = mixAbsorbances(candidate.map((c) => c.A), amounts)
  return deltaE(linearToOklab(linear), targetLab)
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
 * @param {{maxPaints?: number, limit?: number}} options
 * @returns {Array<Recipe>} sorted best-first
 */
export function findRecipes(targetHex, paints, { maxPaints = 3, limit = 5 } = {}) {
  const targetLinear = rgbToLinear(hexToRgb(targetHex))
  const targetLab = linearToOklab(targetLinear)
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
      const amounts = a.map((v) => Math.min(MAX_AMOUNT, v))
      results.push({ candidate, amounts, deltaE: evaluate(candidate, amounts, targetLab) })
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
 * @param {{maxPaints?: number, tolerance?: number}} options  tolerance = allowed extra ΔE over the best recipe
 * @returns {string[]} paint ids
 */
export function proposePaints(targets, paints, { maxPaints = 3, tolerance = 2 } = {}) {
  const chosen = new Set()
  const newPaints = (recipe) => recipe.paints.filter((p) => !chosen.has(p.paintId)).length
  const byWeight = [...targets].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  for (const target of byWeight) {
    const recipes = findRecipes(target.hex, paints, { maxPaints, limit: 8 })
    if (!recipes.length) continue
    const best = Math.min(...recipes.map((r) => r.deltaE))
    const [pick] = recipes
      .filter((r) => r.deltaE <= best + tolerance)
      .sort((x, y) => newPaints(x) - newPaints(y) || x.deltaE - y.deltaE)
    pick.paints.forEach((p) => chosen.add(p.paintId))
  }
  return [...chosen]
}

// A colour joins another colour's mix as a wash when that costs at most this much extra ΔE
// over its own best recipe.
export const WASH_TOLERANCE = 1

/**
 * The same mix with more or less water: every amount scaled by one factor so the result
 * comes as close to the target as that mix can get.
 * @param {Recipe} recipe  the mix to dilute or strengthen
 * @param {string} targetHex
 * @param {Record<string, {id:string, hex:string}>} paintsById
 * @returns {Recipe|null} null when the recipe has no paints (paper white)
 */
export function washRecipe(recipe, targetHex, paintsById) {
  if (!recipe?.paints.length) return null
  const targetLab = linearToOklab(rgbToLinear(hexToRgb(targetHex)))
  const candidate = recipe.paints.map((p) => ({ paint: paintsById[p.paintId], A: absorbanceFromHex(paintsById[p.paintId].hex) }))
  const base = recipe.paints.map((p) => p.amount)
  const error = (logT) => evaluate(candidate, base.map((v) => v * Math.exp(logT)), targetLab)
  // Coarse scan over the water level, then golden-section search around the best step.
  const lo = Math.log(0.02 / Math.max(...base))
  const hi = Math.log(MAX_AMOUNT / Math.max(...base))
  const steps = 48
  let best = lo, bestErr = Infinity
  for (let i = 0; i <= steps; i++) {
    const t = lo + ((hi - lo) * i) / steps
    const err = error(t)
    if (err < bestErr) { bestErr = err; best = t }
  }
  let a = Math.max(lo, best - (hi - lo) / steps)
  let b = Math.min(hi, best + (hi - lo) / steps)
  const phi = (Math.sqrt(5) - 1) / 2
  for (let i = 0; i < 24; i++) {
    const c = b - (b - a) * phi
    const d = a + (b - a) * phi
    if (error(c) < error(d)) b = d
    else a = c
  }
  const logT = (a + b) / 2
  const factor = Math.exp(logT)
  return toRecipe({ items: candidate.map((c, i) => ({ paint: c.paint, amount: base[i] * factor })), deltaE: error(logT) })
}

/**
 * Decide which colours can share a mix. Colours are taken from the largest area down; each one
 * either joins the mix of an earlier colour as a wash (same paints in the same ratio, only the
 * water differs) or keeps its own best recipe and becomes a mix others can join.
 * @param {Array<{hex:string, weight?:number, recipes:Recipe[]}>} colours  recipes = own recipes, best first
 * @param {Array<{id:string, hex:string}>} paints
 * @returns {Array<{family:number, wash:Recipe|null}>} family = index of the colour whose mix is used
 */
export function planWashes(colours, paints, { tolerance = WASH_TOLERANCE } = {}) {
  const byId = Object.fromEntries(paints.map((p) => [p.id, p]))
  const order = colours.map((_, i) => i).sort((x, y) => (colours[y].weight ?? 0) - (colours[x].weight ?? 0))
  const anchors = []
  const plan = colours.map((_, i) => ({ family: i, wash: null }))
  for (const i of order) {
    const own = colours[i].recipes[0]
    if (!own?.paints.length) continue // paper white, or no paints to mix with
    let best = null
    for (const anchor of anchors) {
      const wash = washRecipe(colours[anchor].recipes[0], colours[i].hex, byId)
      if (wash.deltaE <= own.deltaE + tolerance && (!best || wash.deltaE < best.wash.deltaE)) best = { family: anchor, wash }
    }
    if (best) plan[i] = best
    else anchors.push(i)
  }
  return plan
}

function toRecipe({ items, deltaE: err }) {
  const strength = items.reduce((s, it) => s + it.amount, 0)
  const linear = mixAbsorbances(items.map((it) => absorbanceFromHex(it.paint.hex)), items.map((it) => it.amount))
  return {
    paints: items
      .map((it) => ({ paintId: it.paint.id, amount: it.amount, share: strength ? it.amount / strength : 0 }))
      .sort((a, b) => b.amount - a.amount),
    parts: toParts(items.map((it) => it.amount).sort((a, b) => b - a)),
    strength,
    dilution: describeDilution(strength),
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

export function describeDilution(strength) {
  if (strength <= 0.02) return 'paper only'
  if (strength < 0.35) return 'very watery wash'
  if (strength < 0.8) return 'light wash'
  if (strength < 1.5) return 'medium'
  if (strength < 2.5) return 'rich'
  return 'very concentrated (layer/glaze)'
}

// Letter for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
export const WASH_LETTERS = [
  { letter: 'W', label: 'very watery' },
  { letter: 'L', label: 'light' },
  { letter: 'M', label: 'medium' },
  { letter: 'R', label: 'rich' },
  { letter: 'C', label: 'concentrated' },
]

export function washLetter(strength) {
  if (strength <= 0.02) return ''
  if (strength < 0.35) return 'W'
  if (strength < 0.8) return 'L'
  if (strength < 1.5) return 'M'
  if (strength < 2.5) return 'R'
  return 'C'
}

/** Match quality label for a ΔE (OKLab ×100) value. */
export function matchQuality(dE) {
  if (dE < 2) return 'excellent'
  if (dE < 5) return 'good'
  if (dE < 10) return 'fair'
  return 'rough'
}
