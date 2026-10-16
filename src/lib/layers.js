// Layer mode (glazing), the part that works on the pixels: the picture as transparent layers
// painted over each other, light to dark.
//
// Which paints, how strong each wash and how many coats it may get is planned on the server
// (`api/mix/layers`, the reference in layerPlan.js) from the colours of the picture, never from
// the picture itself. What comes back is the plan: every layer with its filter per number of coats
// and the price of a coat. Here the picture comes in: one map of coat counts per layer, each
// smoothed on its own so that every layer has calm shapes to paint, and the accents on the small
// parts the washes miss.
//
// The colour of an area is white paper filtered by every layer: the filters of the layers
// multiply, per channel of linear RGB.
//
// Pure functions on typed arrays so it runs in a Web Worker and in tests.

import { hexToRgb, rgbToLinear, srgbToLinear, linearToSrgb, rgbToHex } from './color.js'
import { boxBlur, toOklabPixels, colourBins, majorityFilter, connectedComponents, mergeSmallRegions, labelAnchors } from './segment.js'
import { geometricAreas, straighten, edgeTolerance } from './geometric.js'

/** Coats per wash layer when nothing else is asked for. */
export const MAX_COATS = 3
/** Accent layers when nothing else is asked for. */
export const ACCENTS = 2
// Whether the coats of a layer may differ in strength when nothing else is asked for.
export const GRADED = false
// The paints are proposed from the picture with this blur, whatever `simplify` is: the proposal
// should not change when only the size of the areas does.
export const PROPOSAL_BLUR = 1
// Chroma of the picture from which a neutral coat costs extra, and where it costs DULL_PRICE.
const CLEAN_FROM = 0.12
const CLEAN_FULL = 0.2
// Rounds in which the areas of the smoothed layers are fitted to each other.
const REVISIONS = 2
// The smallest shape of an accent, as a part of the smallest area of a wash layer: accents are
// there for the small things.
const ACCENT_REGION = 0.1
// An accent is painted in at most this many shapes: the ones that bring most.
const ACCENT_SHAPES = 24
// A spot gets an accent together with other washes than its surroundings (a shape left out of a
// wash) only when that is closer by this much than the accent over the washes as they are.
export const CARVE_GAIN = 3
// The accent for the darks goes on parts of the picture darker than this (OKLab lightness).
export const DARK_FROM = 0.5
// An accent is a step too. It need not pay like a wash, it is there for the small things, but it
// must lower the mean distance of the whole picture by at least this.
const ACCENT_STEP_PRICE = 0.05
// An accent does not go on near-neutral pixels (below this chroma) in paper-white surroundings
// (mean lightness above PAPER_LIGHTNESS over about PAPER_WINDOW pixels each way): print on white,
// glints, the grain of a white wall are not what a brush is for.
const CLUTTER_CHROMA = 0.06
const PAPER_LIGHTNESS = 0.88
const PAPER_WINDOW = 8

// How much a neutral coat dulls a colour of the picture: 0 on greys, 1 on a saturated colour.
export function dulling(a, b) {
  const c = Math.sqrt(a * a + b * b)
  return c <= CLEAN_FROM ? 0 : Math.min(2, (c - CLEAN_FROM) / (CLEAN_FULL - CLEAN_FROM))
}


// OKLab of a linear RGB colour, written into out[o..o+2] (no allocation in the inner loops).
export function writeLab(r, g, b, out, o) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

export const linearHex = (lin, o = 0) => rgbToHex([linearToSrgb(lin[o]), linearToSrgb(lin[o + 1]), linearToSrgb(lin[o + 2])])

// Every combination of coats of the given layers on white paper: linear RGB, OKLab, the work in
// it (the price of its coats, as OKLab distance) and how much it dulls (the extra price of its
// neutral coats on a saturated colour). `prices[k]` = { coat, dull } of a coat of layer k.
// Combination index = coats of layer 0 + levels of layer 0 * (coats of layer 1 + ...).
export function combinations(tables, prices) {
  let lin = new Float64Array([1, 1, 1])
  let work = new Float64Array(1), dull = new Float64Array(1)
  tables.forEach((t, k) => {
    const levels = t.length / 3, n = lin.length / 3
    const next = new Float64Array(n * levels * 3)
    const more = new Float64Array(n * levels), duller = new Float64Array(n * levels)
    for (let c = 0; c < levels; c++) {
      for (let i = 0; i < n; i++) {
        const o = (c * n + i) * 3
        next[o] = lin[i * 3] * t[c * 3]; next[o + 1] = lin[i * 3 + 1] * t[c * 3 + 1]; next[o + 2] = lin[i * 3 + 2] * t[c * 3 + 2]
        more[c * n + i] = work[i] + (c * prices[k].coat) / 100
        duller[c * n + i] = dull[i] + (c * prices[k].dull) / 100
      }
    }
    lin = next
    work = more
    dull = duller
  })
  const size = lin.length / 3
  const lab = new Float64Array(size * 3)
  for (let i = 0; i < size; i++) writeLab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2], lab, i * 3)
  return { lin, lab, work, dull, size }
}

/**
 * The best combination for every colour: the closest one, its work counting as distance.
 * @returns {{best: Int32Array, error: Float64Array}} combination index and deltaE per colour
 */
export function closest(combos, points, n) {
  const best = new Int32Array(n)
  const error = new Float64Array(n)
  const { lab, work, dull, size } = combos
  for (let i = 0; i < n; i++) {
    const L = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
    const clean = dulling(a, b)
    let least = Infinity, least2 = Infinity, bi = 0, bd = 0
    for (let p = 0; p < size; p++) {
      const dL = lab[p * 3] - L, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
      const d2 = dL * dL + da * da + db * db
      if (d2 >= least2) continue
      const cost = Math.sqrt(d2) + work[p] + clean * dull[p]
      if (cost < least) { least = cost; least2 = least * least; bi = p; bd = Math.sqrt(d2) }
    }
    best[i] = bi
    error[i] = bd * 100
  }
  return { best, error }
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

// Colours joined on a grid in OKLab: per occupied cell the mean colour and the summed count;
// `cellOf` = the cell of every colour that came in.
export function joinColours(points, counts, stepL, stepAB) {
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

// Coats of every layer in a combination (see `combinations`).
export function coatsOf(combo, tables) {
  return tables.map((t) => { const levels = t.length / 3, c = combo % levels; combo = (combo - c) / levels; return c })
}

export const unique = (list) => [...new Set(list)]

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

// Pixels no accent goes on: near-neutral ones in paper-white surroundings (print on white, glints,
// the grain of a white wall). The surroundings are the mean of 3 x 3 blocks of PAPER_WINDOW pixels.
function clutterMask(rgba, lab, width, height) {
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i)
  const size = PAPER_WINDOW
  const gw = Math.ceil(width / size), gh = Math.ceil(height / size)
  const sums = new Float64Array(gw * gh), counts = new Float64Array(gw * gh)
  for (let y = 0; y < height; y++) {
    const row = ((y / size) | 0) * gw
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const block = row + ((x / size) | 0)
      sums[block] += 0.2126 * lut[rgba[i]] + 0.7152 * lut[rgba[i + 1]] + 0.0722 * lut[rgba[i + 2]]
      counts[block]++
    }
  }
  // Lightness of a grey of that luminance, per block with its neighbours.
  const paper = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = gx + dx, yy = gy + dy
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue
          sum += sums[yy * gw + xx]; n += counts[yy * gw + xx]
        }
      }
      paper[gy * gw + gx] = Math.cbrt(sum / n) > PAPER_LIGHTNESS ? 1 : 0
    }
  }
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = ((y / size) | 0) * gw
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (paper[row + ((x / size) | 0)] && Math.hypot(lab[p * 3 + 1], lab[p * 3 + 2]) < CLUTTER_CHROMA) mask[p] = 1
    }
  }
  return mask
}

/**
 * Full pipeline: picture -> layers.
 *
 * @param {Uint8ClampedArray} rgba  image data at working resolution
 * @param {Array<{id:string, hex:string}>} paints  the paint box
 * @param {{count?: number, paintIds?: string[], maxCoats?: number, graded?: boolean, simplify?: number, accents?: number}} options
 *   paintIds = the base paints; without it paints are proposed: up to `count` (default 4) for
 *   the washes and up to one more per accent, from the picture with a fixed blur. With paintIds,
 *   `count` is the most wash layers (default: every given paint may be one).
 *   simplify 0..10 as in `segmentImage`: blur, smoothing and the smallest area of every layer.
 *   The washes are fitted to the blurred picture and get calm areas; the accents are fitted to
 *   what those washes leave over of the picture as it is, and may stay smaller.
 *   maxCoats = the most coats a wash layer can get. graded, accents: see `proposeLayerPaints` in
 *   layerPlan.js.
 * @param {(request: object) => (object|Promise<object>)} planLayers  plans the layers from the
 *   colours of the picture: the account API (`api/mix/layers`), or `planLayersFor` of layerPlan.js
 * @returns {Promise<{
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
 * }>}
 *   paintIds = the paints of the layers, in painting order, each once. A proposal only names
 *   paints that get something to paint (fewer than asked for when the rest would not pay for its
 *   work); its paints and washes do not depend on `simplify`. A given paint that is not needed
 *   keeps a layer without coats (`top` 0) at the end. Planning given paints starts afresh from
 *   those paints, so it can differ a little from the proposal that named them.
 *   layers = in painting order: the washes of clean colour light to dark, then the washes of
 *   neutral paints, then the accents light to dark. A paint can have two layers, a wash and an
 *   accent. An accent has at most 24 shapes and stays off print and glints on white.
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
export async function layerImage(rgba, width, height, paints, { count, paintIds, maxCoats = MAX_COATS, graded = GRADED, simplify = 4, accents: maxAccents = ACCENTS, geometric = false } = {}, planLayers) {
  const pixels = width * height
  maxCoats = Math.max(1, maxCoats)
  const blur = Math.round(simplify / 3)
  const binsOf = (radius) => colourBins(toOklabPixels(boxBlur(rgba, width, height, radius), pixels), pixels)
  // The picture as it is, and its colours on a coarse grid: what the accents are fitted to.
  const lab = toOklabPixels(rgba, pixels)
  const sharp = colourBins(lab, pixels)
  const cells = joinColours(sharp.points, sharp.counts, 0.03, 0.015)
  // Per pixel: how much a neutral coat would dull it, and whether it is clutter no accent goes on.
  const clean = new Float32Array(pixels)
  for (let p = 0; p < pixels; p++) clean[p] = dulling(lab[p * 3 + 1], lab[p * 3 + 2])
  const clutter = maxAccents > 0 ? clutterMask(rgba, lab, width, height) : null
  // The picture blurred: what the washes are fitted to.
  const calm = blur ? binsOf(blur) : sharp
  const bins = calm.counts.length

  // What washes leave over is worked out on the server: every pixel gets the washes of its
  // blurred colour and keeps its own colour. Sent are the pairs (blurred colour, colour on the
  // coarse grid) of the pixels, in the order they first occur, with how many pixels each has.
  const leftOf = (blurred) => {
    if (!clutter) return null
    const nc = cells.counts.length
    const seen = new Map()
    for (let p = 0; p < pixels; p++) {
      if (clutter[p]) continue
      const key = blurred.binOf[p] * nc + cells.cellOf[sharp.binOf[p]]
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const pairs = new Array(seen.size * 3)
    let i = 0
    for (const [key, n] of seen) {
      const cell = key % nc
      pairs[i++] = (key - cell) / nc
      pairs[i++] = cell
      pairs[i++] = n
    }
    return { cells: rounded(cells.points), pairs }
  }
  const coloursOf = ({ points, counts }) => ({ points: rounded(points), counts: Array.from(counts) })

  // The plan for the given paints, laid over the picture.
  const build = (plan, proposal) => {
  const tables = plan.tables.map((t) => Float64Array.from(t))
  const { prices } = plan
  let layers = plan.layers.map((layer) => ({ ...layer, filters: Float64Array.from(layer.filters) }))
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
            cost[o + c] += Math.sqrt(dL * dL + da * da + db * db) * 100 + (prices[k].coat + clean[p] * prices[k].dull) * c
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
    // Geometric: the areas of every layer as polygons; laid over each other they overlap.
    if (geometric) maps[k] = geometricAreas(maps[k], width, height, simplify)
    for (let p = 0; p < pixels; p++) code[p] += maps[k][p] * radix[k]
  }
  if (washes.length > 1) revise(washes)

  // The accents, from the picture as it is: every pixel takes an accent that brings it closer.
  // Their areas are only cleared of specks, not smoothed: they are for the small things.
  // Inside a shape of an accent the washes are then fitted to the accent: the painter leaves that
  // shape out of a wash, or gives it fewer coats, so that a turquoise detail is not painted over
  // an orange wash.
  // One accent after the other, each over what is there so far: a further accent then never
  // changes the ones before it.
  for (const k of accents) {
    // What every colour would choose with the layers up to this accent to itself.
    const { best: ideal } = closest({ ...all, size: radix[k] * 2 }, cells.points, cells.counts.length)
    const raw = new Int32Array(pixels)
    const gains = new Float32Array(pixels)
    const costOf = (q, p) => {
      const dL = all.lab[q * 3] - lab[p * 3], da = all.lab[q * 3 + 1] - lab[p * 3 + 1], db = all.lab[q * 3 + 2] - lab[p * 3 + 2]
      return Math.sqrt(dL * dL + da * da + db * db) + all.work[q] + clean[p] * all.dull[q]
    }
    const darks = layers[k].role === 'dark'
    for (let p = 0; p < pixels; p++) {
      if (clutter[p] || (darks && lab[p * 3] >= DARK_FROM)) continue
      // Over the washes as they are ...
      const without = costOf(code[p], p)
      let withIt = costOf(code[p] + radix[k], p)
      // ... or with the washes this colour would choose for itself, if that is clearly closer.
      const own = ideal[cells.cellOf[sharp.binOf[p]]]
      if (own >= radix[k]) withIt = Math.min(withIt, costOf(own, p) + CARVE_GAIN / 100)
      if (withIt < without) { raw[p] = 1; gains[p] = without - withIt }
    }
    // No majority filter here: it would eat the thin lines accents are there for. Specks go,
    // and of the shapes that are left the ones that bring most stay: few enough for a brush.
    const specks = Math.max(4, Math.round(minRegion * ACCENT_REGION))
    let calmed = mergeSmallRegions(raw, width, height, specks)
    // Accents are small: their edges are straightened with half the tolerance, and nothing is merged away for it.
    if (geometric) calmed = mergeSmallRegions(straighten(calmed, width, height, edgeTolerance(width, height, simplify) / 2), width, height, specks)
    const { regionMap, regionCluster } = connectedComponents(calmed, width, height)
    const worth = new Float64Array(regionCluster.length)
    for (let p = 0; p < pixels; p++) if (calmed[p] && raw[p]) worth[regionMap[p]] += gains[p]
    const shapes = []
    regionCluster.forEach((on, r) => { if (on) shapes.push(r) })
    shapes.sort((x, y) => worth[y] - worth[x] || x - y)
    const kept = new Uint8Array(regionCluster.length)
    let bought = 0
    for (const r of shapes.slice(0, ACCENT_SHAPES)) if (worth[r] > 0) { kept[r] = 1; bought += worth[r] }
    // All its shapes together must be worth the step.
    if ((bought / pixels) * 100 < ACCENT_STEP_PRICE) kept.fill(0)
    for (let p = 0; p < pixels; p++) {
      calmed[p] = kept[regionMap[p]]
      code[p] += calmed[p] * radix[k]
    }
    maps[k] = calmed
    // Inside a shape of the accent the washes are fitted to it.
    for (let round = 0; round < REVISIONS; round++) {
      for (const w of washes) {
        const levels = levelsOf[w]
        const cost = new Float64Array(regionCluster.length * levels)
        for (let p = 0; p < pixels; p++) {
          if (!calmed[p]) continue
          const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
          const rest = code[p] - maps[w][p] * radix[w]
          const o = regionMap[p] * levels
          for (let c = 0; c < levels; c++) {
            // "At most c coats here": a wash only ever does less under an accent, never more.
            const coats = Math.min(c, maps[w][p])
            const q = (rest + coats * radix[w]) * 3
            const dL = all.lab[q] - L, da = all.lab[q + 1] - a, db = all.lab[q + 2] - b
            cost[o + c] += Math.sqrt(dL * dL + da * da + db * db) * 100 + (prices[w].coat + clean[p] * prices[w].dull) * coats
          }
        }
        for (let p = 0; p < pixels; p++) {
          if (!calmed[p]) continue
          const o = regionMap[p] * levels
          let most = levels - 1
          for (let c = levels - 2; c >= 0; c--) if (cost[o + c] < cost[o + most]) most = c
          if (most >= maps[w][p]) continue
          code[p] += (most - maps[w][p]) * radix[w]
          maps[w][p] = most
        }
      }
    }
    // A shape of the accent that does not pay over the washes as they are now goes again.
    revise([k])
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

  // A proposed paint that ends up without a single shape to paint (an accent whose spots were all
  // too small or too scattered) is not proposed after all.
  if (proposal) {
    const kept = layers.map((layer) => layer.coats[0].share > 0)
    for (const combo of combos) combo.coats = combo.coats.filter((_, k) => kept[k])
    layers = layers.filter((_, k) => kept[k])
    layers.forEach((layer, index) => { layer.index = index })
  }

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

  // Given paints: all of them may be washes, unless `count` asks for fewer wash layers.
  if (paintIds) {
    const base = unique(paintIds).map((id) => paints.find((p) => p.id === id)).filter(Boolean)
    const options = { count: Math.min(count ?? base.length, base.length), maxCoats, graded, accents: maxAccents, keepUnused: true }
    return build(await planLayers({ colours: coloursOf(calm), left: leftOf(calm), paints: base.map(plainPaint), ...options }))
  }
  // A proposal is planned on the picture with a fixed blur, so that paints and washes do not
  // depend on `simplify`.
  const blurred = blur === PROPOSAL_BLUR ? calm : binsOf(PROPOSAL_BLUR)
  const options = { count: count ?? 4, maxCoats, graded, accents: maxAccents, keepUnused: false }
  return build(await planLayers({ colours: coloursOf(blurred), left: leftOf(blurred), paints: paints.map(plainPaint), ...options }), true)
}

const plainPaint = ({ id, hex }) => ({ id, hex })
// Colours on their way to the server: OKLab to six places is far finer than any eye, and keeps
// the request small.
const rounded = (values) => Array.from(values, (v) => Math.round(v * 1e6) / 1e6)
