// From the analysis to the mixes a painter prepares.
//
// The analysis (segment.js) sorts the picture into mixes and their washes without knowing the
// paints, and is asked for more mixes than wanted. Here the paints come in: mixes that turn out
// to be the same recipe are joined, and then the two mixes that are cheapest to paint as one are
// joined again and again until the wanted number is left. Washes are used before a mix is spent:
// what a larger mix reaches with more or less water does not keep a mix of its own.

import { findRecipes, washRecipe } from './mixing.js'
import { hexToOklab, deltaE } from './color.js'

/** How many mixes to ask the analysis for, so there is something to choose from. */
export function mixesToRequest(wanted) {
  return Math.min(48, Math.max(wanted + 4, wanted * 2))
}

/**
 * @param {Array<{index:number, group:number, hex:string, pixelCount:number}>} clusters  from segmentImage
 * @param {Array<{id:string, hex:string}>} paints  paints to mix with
 * @param {{maxPaints?: number, wanted?: number, variety?: number}} options
 *   wanted = number of mixes to end up with;
 *   variety 0..10 = what decides which mixes are joined: at 0 the error times the area it covers
 *   (the picture as a whole stays as accurate as possible), at 10 the error in hue alone (a small
 *   area of a different hue keeps its mix, at the price of similar large colours sharing one)
 * @returns {Array<{group:(number|string), clusters:Array, recipes:Array, pixels:number}>}
 *   recipes are fitted to the largest wash the mix started with
 */
export function planMixes(clusters, paints, { maxPaints = 3, wanted = Infinity, variety = 5 } = {}) {
  const byId = Object.fromEntries(paints.map((p) => [p.id, p]))
  const white = hexToOklab('#ffffff')
  const level = Math.min(10, Math.max(0, variety)) / 10
  // A wash that comes out too light or too dark is a smaller loss than one of the wrong hue:
  // depth can be built up in layers, hue cannot. The more variety is wanted, the less it counts.
  const lightness = 1 - 0.7 * level
  // How far a mix stays from a colour when it is painted as a wash of that mix.
  const miss = (mix, cluster) => {
    const [base] = mix.recipes
    if (!base) return 0
    const target = hexToOklab(cluster.hex)
    const reached = base.paints.length ? hexToOklab(washRecipe(base, cluster.hex, byId).hex) : white
    return deltaE([reached[0] * lightness, reached[1], reached[2]], [target[0] * lightness, target[1], target[2]])
  }
  const pixelsOf = (members) => members.reduce((sum, c) => sum + c.pixelCount, 0)

  const found = new Map()
  let total = 0
  for (const c of clusters) {
    if (!c.pixelCount) continue
    total += c.pixelCount
    if (!found.has(c.group)) found.set(c.group, [])
    found.get(c.group).push(c)
  }

  // The same paints in about the same ratio are the same mix, whatever the analysis called them.
  const mixKey = (recipe) =>
    recipe ? recipe.paints.map((p) => `${p.paintId}:${Math.round(p.share * 5)}`).sort().join('+') : ''
  const byKey = new Map()
  for (const [group, members] of found) {
    const anchor = members.reduce((x, y) => (y.pixelCount > x.pixelCount ? y : x))
    const recipes = findRecipes(anchor.hex, paints, { maxPaints, limit: 5 })
    const key = mixKey(recipes[0])
    const same = byKey.get(key)
    if (same) {
      same.clusters.push(...members)
      same.pixels += pixelsOf(members)
    } else {
      byKey.set(key, { group, anchor, clusters: [...members], recipes, pixels: pixelsOf(members) })
    }
  }
  const mixes = [...byKey.values()]

  // worst[a][b] = the worst miss when the colours of mix b are painted as washes of mix a.
  const n = mixes.length
  const worst = mixes.map((a, i) =>
    mixes.map((b, j) => (i === j ? 0 : b.clusters.reduce((w, c) => Math.max(w, miss(a, c)), 0))),
  )
  const alive = mixes.map(() => true)
  const areaPower = 1 - level
  let left = n
  while (left > wanted) {
    let best = null
    for (let a = 0; a < n; a++) {
      if (!alive[a]) continue
      for (let b = 0; b < n; b++) {
        if (a === b || !alive[b]) continue
        const cost = worst[a][b] * Math.pow(mixes[b].pixels / total, areaPower)
        if (!best || cost < best.cost) best = { a, b, cost }
      }
    }
    const { a, b } = best
    mixes[a].clusters.push(...mixes[b].clusters)
    mixes[a].pixels += mixes[b].pixels
    alive[b] = false
    // Mix a now also holds the colours of b: as part of another mix it misses by the worse of the two.
    for (let x = 0; x < n; x++) if (alive[x] && x !== a) worst[x][a] = Math.max(worst[x][a], worst[x][b])
    left--
  }
  const kept = mixes.filter((_, i) => alive[i])

  // Every colour goes to the mix that reaches it best; the colour a mix was fitted to stays.
  if (kept.length > 1) {
    const moves = []
    for (const mix of kept) {
      for (const c of mix.clusters) {
        if (c === mix.anchor) continue
        let target = mix, least = miss(mix, c)
        for (const other of kept) {
          if (other === mix) continue
          const m = miss(other, c)
          if (m < least - 1) { least = m; target = other }
        }
        if (target !== mix) moves.push({ c, from: mix, to: target })
      }
    }
    for (const { c, from, to } of moves) {
      from.clusters.splice(from.clusters.indexOf(c), 1)
      from.pixels -= c.pixelCount
      to.clusters.push(c)
      to.pixels += c.pixelCount
    }
  }
  return kept
}
