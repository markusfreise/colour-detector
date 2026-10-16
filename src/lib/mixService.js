// The mixing service: what the server answers under api/mix/ (server/mix/), in JavaScript.
//
// The mixing model, the search for recipes and the planning of layers run on the server, so that
// they are not part of the app that goes to the browser. The picture never goes there: the browser
// analyses it and sends colours (hex, OKLab), how much of the picture each covers, and the paints
// (id, hex). This file is the reference the PHP port is checked against (server/tests/mix-cases.json,
// made by server/tests/make-mix-cases.mjs) and what the tests of the app mix with. It is not
// imported by the app: vite.config.js stops a build that would carry it.

import { findRecipes, proposePaints, washRecipe, washLetter, valueReach } from './mixing.js'
import { planMixes } from './mixes.js'
import { hexToOklab, oklabToHex } from './color.js'
import { planLayersFor } from './layerPlan.js'

const byIdOf = (paints) => Object.fromEntries(paints.map((p) => [p.id, p]))

/**
 * Auto: the paints that suit the colours of a picture.
 * @param {{targets: Array<{hex:string, weight:number}>, paints: Array<{id:string, hex:string}>, maxPaints: number, values: boolean}} request
 * @returns {{paintIds: string[]}}
 */
export function propose({ targets, paints, maxPaints, values }) {
  return { paintIds: proposePaints(targets, paints, { maxPaints, values: !!values }) }
}

/**
 * The mixes of a picture: the colours the analysis found (clusters), joined into `wanted` mixes,
 * every mix with its recipes and its washes, one per water level.
 * @param {{clusters: Array<{index:number, group:(number|string), hex:string, pixelCount:number}>,
 *   paints: Array<{id:string, hex:string}>, maxPaints: number, wanted: number, variety: number, values: boolean}} request
 *   values = value mode: the picture is grey, a mix stands for its values and only lightness counts
 * @returns {{mixes: Array<{group:(number|string), recipes: Array<Recipe>,
 *   items: Array<{clusters:number[], pixels:number, hex:string, letter:string, washes: Array<Recipe>}>}>}}
 *   items = the washes of the mix: the clusters painted with it at one water level, their colour,
 *   the letter of the level and the recipes of the mix with that much water
 */
export function plan({ clusters, paints, maxPaints, wanted, variety, values }) {
  values = !!values
  const byId = byIdOf(paints)
  const washOf = (recipe, hex) => (recipe.paints.length ? washRecipe(recipe, hex, byId, { values }) : recipe)
  // Value mode with paints that do not get as dark as the picture (a yellow alone): the values
  // of the picture are spread over what the paints reach, from blank paper for the lightest to
  // the darkest paint for the darkest, so that the picture keeps all its steps instead of
  // ending in one flat dark. Paints that reach the darks leave the values alone.
  let colours = clusters
  if (values && paints.length) {
    const used = clusters.filter((c) => c.pixelCount).map((c) => hexToOklab(c.hex)[0])
    const light = Math.max(...used), dark = Math.min(...used)
    const reach = valueReach(paints, { maxPaints })
    if (reach > dark && light > dark) {
      colours = clusters.map((c) => {
        const L = hexToOklab(c.hex)[0]
        return { ...c, hex: oklabToHex([1 - ((light - L) * (1 - reach)) / (light - dark), 0, 0]) }
      })
    }
  }
  const groups = planMixes(colours, paints, { maxPaints, wanted, variety, values })
  return {
    mixes: groups.map(({ group, clusters: members, recipes }) => {
      let items = members.map((c) => ({ clusters: [c.index], pixels: c.pixelCount, lab: hexToOklab(c.hex) }))
      // Merge washes until every water level of the mix occurs once.
      for (;;) {
        const levels = new Map()
        for (const item of items) {
          item.hex = oklabToHex(item.lab)
          // A value study is painted in finer steps of water.
          item.letter = recipes.length ? washLetter(washOf(recipes[0], item.hex).fullness, values) : ''
          const same = levels.get(item.letter)
          if (same) {
            const n = same.pixels + item.pixels
            same.lab = same.lab.map((v, j) => (v * same.pixels + item.lab[j] * item.pixels) / n)
            same.pixels = n
            same.clusters.push(...item.clusters)
          } else {
            levels.set(item.letter, item)
          }
        }
        if (levels.size === items.length) break
        items = [...levels.values()]
      }
      return {
        group,
        recipes,
        items: items.map((item) => ({
          clusters: item.clusters,
          pixels: item.pixels,
          hex: item.hex,
          letter: item.letter,
          washes: recipes.map((r) => washOf(r, item.hex)),
        })),
      }
    }),
  }
}

/**
 * Recipes for single colours, several at once.
 * @param {{paints: Array<{id:string, hex:string}>, jobs: Array<
 *   {hex:string, maxPaints:number, limit:number, values?:boolean, only?:string[]} |
 *   {hex:string, wash:Array<Recipe>, values?:boolean}>}} request
 *   a job with `wash`: the given recipes with as much water as comes closest to `hex`;
 *   otherwise the best recipes for `hex` from the paints (`only`: from these of them)
 * @returns {{results: Array<Array<Recipe>>}}
 */
export function recipes({ paints, jobs }) {
  const byId = byIdOf(paints)
  return {
    results: jobs.map((job) => {
      const values = !!job.values
      if (job.wash) return job.wash.map((r) => (r.paints.length ? washRecipe(r, job.hex, byId, { values }) : r))
      const pool = job.only ? job.only.map((id) => byId[id]).filter(Boolean) : paints
      return findRecipes(job.hex, pool, { maxPaints: job.maxPaints, limit: job.limit, values })
    }),
  }
}

/** Layer mode: the plan of the layers for the colours of a picture (see `planLayersFor`). */
export function layers(request) {
  return planLayersFor(request)
}

export const MIX_ROUTES = { propose, plan, recipes, layers }
