// usage: node render.mjs <repo path> <out dir>
// How true is the flat picture to the photo, with the library of the given checkout? Analyses the
// test photos the way the app does at its default settings (the palette at the finest Simplify,
// the paper as a colour, paints proposed, mixes planned, the areas against that palette) and
// measures what the calm figures of tools/contest do not see: light and dark, small things, and
// the steps of light inside pale zones. Writes pictures and figures to compare versions.
//
// Each photo is measured at several stages, so that a loss can be put down to its cause:
//   finest/found   the palette at the finest Simplify, every wash as the analysis found it
//   finest/target  the same with the washes of a mix on one water level as one colour, as the app lists them
//   finest/mixed   the same areas in the colours the paints give (washes on one water level are one colour)
//   s0/mixed       the areas of Simplify shown as 0, as the app opens a picture
//   s3/mixed       the areas of Simplify shown as 3
import fs from 'node:fs'
import path from 'node:path'

const [repo, outDir] = process.argv.slice(2).map((p) => path.resolve(p))
const here = path.dirname(new URL(import.meta.url).pathname)
const lib = (f) => import(path.join(repo, 'src', f))
const { segmentImage, toOklabPixels, connectedComponents, FINEST, SIMPLIFY_ZERO } = await lib('lib/segment.js')
const { hexToRgb, hexToOklab, oklabToHex } = await lib('lib/color.js')
const { proposePaints, washRecipe, washLetter } = await lib('lib/mixing.js')
const { planMixes, mixesToRequest } = await lib('lib/mixes.js')
const { stockPaints } = await lib('data/paints.js')
fs.mkdirSync(outDir, { recursive: true })

const COLOURS = 20
const DETAILS = 5
const MAX_PAINTS = 3
const PAPER_HEX = '#ffffff'
const REFERENCE_PIXELS = 480000
// A thing stands out when it is this much lighter or darker (OKLab L) than what is around it.
const STANDS_OUT = 0.06
// Its surroundings: a window of this part of the picture's side to each side.
const AROUND = 0.04
// A small thing: at least this many pixels in a picture of REFERENCE_PIXELS, at most this part of the picture.
const SMALLEST = 16
const LARGEST = 0.02
// It is kept when the flat picture shows at least this part of its contrast.
const KEPT = 0.5
// The bands of light and dark (OKLab L of the photo).
const LIGHT = 0.8
const DARK = 0.4

/** Mean of `src` in a window of `radius` to each side, by a summed table. */
function boxMean(src, w, h, radius) {
  const sum = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const t = Math.max(0, y - radius), b = Math.min(h, y + radius + 1)
    for (let x = 0; x < w; x++) {
      const l = Math.max(0, x - radius), r = Math.min(w, x + radius + 1)
      out[y * w + x] = (sum[b * (w + 1) + r] - sum[t * (w + 1) + r] - sum[b * (w + 1) + l] + sum[t * (w + 1) + l]) / ((b - t) * (r - l))
    }
  }
  return out
}

/** The small things of the photo: connected pixels that stand out from their surroundings, lighter (+1) or darker (-1). */
function smallThings(L, w, h) {
  const count = w * h
  const around = boxMean(L, w, h, Math.round(AROUND * Math.sqrt(count)))
  const sign = new Int8Array(count)
  for (let p = 0; p < count; p++) sign[p] = L[p] - around[p] > STANDS_OUT ? 1 : L[p] - around[p] < -STANDS_OUT ? -1 : 0
  const seen = new Uint8Array(count)
  const least = Math.max(4, Math.round((SMALLEST * count) / REFERENCE_PIXELS))
  const things = []
  const stack = []
  for (let start = 0; start < count; start++) {
    if (!sign[start] || seen[start]) continue
    const pixels = []
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const p = stack.pop()
      pixels.push(p)
      const x = p % w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= count || seen[q] || sign[q] !== sign[start]) continue
        seen[q] = 1
        stack.push(q)
      }
    }
    if (pixels.length < least || pixels.length > LARGEST * count) continue
    let contrast = 0
    for (const p of pixels) contrast += L[p] - around[p]
    contrast /= pixels.length
    things.push({ sign: sign[start], pixels, contrast, weight: Math.abs(contrast) * Math.sqrt(pixels.length) })
  }
  return things
}

/** The figures of one flat picture: `flat` = OKLab per pixel, `labels` = its colour per pixel. */
function measure(photo, soft, things, flat, labels, w, h, stage = '') {
  const count = w * h
  const Lf = new Float32Array(count)
  for (let p = 0; p < count; p++) Lf[p] = flat[p * 3]
  const aroundFlat = boxMean(Lf, w, h, Math.round(AROUND * Math.sqrt(count)))
  // Small things: how many keep at least KEPT of their contrast, counted and by weight.
  const kept = { 1: { n: 0, kept: 0, weight: 0, keptWeight: 0 }, [-1]: { n: 0, kept: 0, weight: 0, keptWeight: 0 } }
  const lost = []
  for (const thing of things) {
    let contrast = 0
    for (const p of thing.pixels) contrast += Lf[p] - aroundFlat[p]
    const part = contrast / thing.pixels.length / thing.contrast
    const k = kept[thing.sign]
    k.n++
    k.weight += thing.weight
    if (part >= KEPT) { k.kept++; k.keptWeight += thing.weight } else lost.push(thing)
    if (process.env.ACCURACY_THINGS) process.stderr.write(`T ${stage} ${thing.sign} ${thing.pixels.length} ${Math.abs(thing.contrast).toFixed(3)} ${part >= KEPT ? 1 : 0} ${part.toFixed(2)}\n`)
  }
  // Light and dark: the error of L in each band of the photo, so that a small band counts as much as a large one.
  const bands = [0, 1, 2].map(() => ({ n: 0, error: 0, bias: 0 }))
  let dE = 0
  for (let p = 0; p < count; p++) {
    const band = bands[soft[p] >= LIGHT ? 2 : soft[p] < DARK ? 0 : 1]
    band.n++
    band.error += Math.abs(Lf[p] - soft[p])
    band.bias += Lf[p] - soft[p]
    dE += Math.hypot(flat[p * 3] - photo[p * 3], flat[p * 3 + 1] - photo[p * 3 + 1], flat[p * 3 + 2] - photo[p * 3 + 2])
  }
  const tone = bands.map((b) => (b.n > count * 0.005 ? { share: b.n / count, error: (b.error / b.n) * 100, bias: (b.bias / b.n) * 100 } : null))
  const present = tone.filter(Boolean)
  // Pale zones: how much of the steps of light inside the light band the flat picture shows
  // (1 = all of it, 0 = as good as one flat colour), and in how many colours.
  let mean = 0
  for (let p = 0; p < count; p++) if (soft[p] >= LIGHT) mean += soft[p]
  const lights = bands[2].n
  mean /= lights || 1
  let spread = 0, miss = 0, onPaper = 0
  const used = new Map()
  for (let p = 0; p < count; p++) {
    if (soft[p] < LIGHT) continue
    spread += (soft[p] - mean) ** 2
    miss += (Lf[p] - soft[p]) ** 2
    used.set(labels[p], (used.get(labels[p]) ?? 0) + 1)
    if (Lf[p] > 0.995) onPaper++
  }
  const pale = lights > count * 0.005 && Math.sqrt(spread / lights) > 0.01
    ? { modelling: Math.max(-1, 1 - miss / spread), miss, spread, steps: [...used.values()].filter((n) => n >= lights * 0.02).length, paper: onPaper / lights }
    : null
  const { regionSize } = connectedComponents(labels, w, h)
  return {
    lightsKept: kept[1], darksKept: kept[-1], lost,
    tone, toneBalanced: present.reduce((s, b) => s + b.error, 0) / present.length,
    pale,
    areas: regionSize.length,
    specks: regionSize.filter((s) => s < 40).length,
    dE: (dE / count) * 100,
  }
}

const names = fs.readdirSync(path.join(here, 'photos')).filter((f) => f.endsWith('.raw')).map((f) => f.slice(0, -4)).sort()
const metrics = {}
for (const name of names) {
  const [w, h] = fs.readFileSync(path.join(here, 'photos', `${name}.size`), 'utf8').trim().split(' ').map(Number)
  const rgba = new Uint8ClampedArray(fs.readFileSync(path.join(here, 'photos', `${name}.raw`)))
  const count = w * h
  const photo = toOklabPixels(rgba, count)
  const L = new Float32Array(count)
  for (let p = 0; p < count; p++) L[p] = photo[p * 3]
  // Without the noise of single pixels: what a small thing is measured on, and the steps of light.
  const things = smallThings(boxMean(L, w, h, 1), w, h)
  const soft = boxMean(L, w, h, 2)

  // The palette, as `analyse` in src/stores/analysis.js finds it.
  const t0 = performance.now()
  const palette = segmentImage(rgba.slice(), w, h, { colours: mixesToRequest(COLOURS), simplify: FINEST, variety: DETAILS, paper: true })
  const ms = Math.round(performance.now() - t0)
  const candidates = stockPaints.filter((p) => p.enabled)
  const targets = palette.clusters.filter((c) => c.pixelCount && !c.paper).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
  const ids = proposePaints(targets, candidates, { maxPaints: MAX_PAINTS })
  const box = stockPaints.filter((p) => ids.includes(p.id))
  const byId = Object.fromEntries(box.map((p) => [p.id, p]))
  // The colours, as `recomputeAllRecipes` builds them: washes of a mix on one water level are one colour.
  const groups = planMixes(palette.clusters.filter((c) => !c.paper), box, { maxPaints: MAX_PAINTS, wanted: COLOURS, variety: DETAILS })
  const washOf = (recipe, hex) => (recipe.paints.length ? washRecipe(recipe, hex, byId) : recipe)
  // ACCURACY_FINE=n tries water levels split in n (the app has one step per level in mix mode).
  const fine = Number(process.env.ACCURACY_FINE ?? 1)
  const letterOf = (fullness) => {
    if (fine <= 1) return washLetter(fullness)
    const exact = washLetter(fullness, true)
    // ACCURACY_FINE_ONLY=WL splits only those levels.
    if (exact && process.env.ACCURACY_FINE_ONLY && !process.env.ACCURACY_FINE_ONLY.includes(exact[0])) return exact[0]
    return exact ? exact[0] + Math.ceil((Number(exact.slice(1)) * fine) / 5) : ''
  }
  const targetOf = new Map(), mixedOf = new Map()
  for (const { clusters, recipes } of groups) {
    let items = clusters.map((c) => ({ clusters: [c.index], pixels: c.pixelCount, lab: hexToOklab(c.hex) }))
    for (;;) {
      const levels = new Map()
      for (const item of items) {
        item.hex = oklabToHex(item.lab)
        item.letter = recipes.length ? letterOf(washOf(recipes[0], item.hex).fullness) : ''
        const same = levels.get(item.letter)
        if (same) {
          const n = same.pixels + item.pixels
          same.lab = same.lab.map((v, j) => (v * same.pixels + item.lab[j] * item.pixels) / n)
          same.pixels = n
          same.clusters.push(...item.clusters)
        } else levels.set(item.letter, item)
      }
      if (levels.size === items.length) break
      items = [...levels.values()]
    }
    for (const item of items) for (const c of item.clusters) {
      targetOf.set(c, item.hex)
      mixedOf.set(c, recipes.length ? washOf(recipes[0], item.hex).hex : item.hex)
    }
  }
  const paper = palette.clusters.find((c) => c.paper)
  if (paper) { targetOf.set(paper.index, PAPER_HEX); mixedOf.set(paper.index, PAPER_HEX) }
  const mixes = groups.length
  const colours = new Set(mixedOf.values()).size

  // The areas of a step of Simplify, against that palette.
  const fixed = palette.clusters.filter((c) => c.pixelCount || c.paper).map(({ index, hex, group, level, paper: blank }) => ({ index, hex: blank && !palette.clusters[index].pixelCount ? PAPER_HEX : hex, group, level, paper: blank }))
  const clustersAt = (shown) => {
    const result = shown == null ? palette : segmentImage(rgba.slice(), w, h, { simplify: SIMPLIFY_ZERO + shown, variety: DETAILS, fixed })
    const out = new Int32Array(count)
    for (let p = 0; p < count; p++) {
      const c = result.regions[result.regionMap[p]].cluster
      out[p] = shown == null ? c : fixed[c].index
    }
    return out
  }
  const flatOf = (clusterOf, hexOf) => {
    const hexes = [...new Set(hexOf.values())]
    const labs = hexes.map(hexToOklab)
    const flat = new Float32Array(count * 3)
    const labels = new Int32Array(count)
    for (let p = 0; p < count; p++) {
      const i = hexes.indexOf(hexOf.get(clusterOf[p]) ?? PAPER_HEX)
      labels[p] = i
      flat[p * 3] = labs[i][0]; flat[p * 3 + 1] = labs[i][1]; flat[p * 3 + 2] = labs[i][2]
    }
    return { flat, labels, rgb: hexes.map(hexToRgb) }
  }
  const foundOf = new Map(palette.clusters.map((c) => [c.index, c.paper && !c.pixelCount ? PAPER_HEX : c.hex]))
  const stages = { 'finest/found': [null, foundOf], 'finest/target': [null, targetOf], 'finest/mixed': [null, mixedOf], 's0/mixed': [0, mixedOf], 's3/mixed': [3, mixedOf] }
  // ACCURACY_STAGES=finest measures the palette alone (no sheets), which is quick.
  if (process.env.ACCURACY_STAGES === 'finest') { delete stages['s0/mixed']; delete stages['s3/mixed'] }
  if (process.env.ACCURACY_STAGES === 's0') for (const key of Object.keys(stages)) if (key !== 's0/mixed') delete stages[key]
  const cache = new Map()
  for (const [stage, [shown, hexOf]] of Object.entries(stages)) {
    if (!cache.has(shown)) cache.set(shown, clustersAt(shown))
    const { flat, labels, rgb } = flatOf(cache.get(shown), hexOf)
    const m = measure(photo, soft, things, flat, labels, w, h, stage)
    const { lost, ...figures } = m
    metrics[`${name} ${stage}`] = { ms, mixes, colours, ...figures }
    if (stage !== 's0/mixed' && stage !== 's3/mixed') continue
    // The flat picture, without outlines: the light is what is judged here.
    const out = Buffer.alloc(count * 3)
    for (let p = 0; p < count; p++) for (let k = 0; k < 3; k++) out[p * 3 + k] = rgb[labels[p]][k]
    const tag = stage.split('/')[0]
    fs.writeFileSync(path.join(outDir, `${name}-${tag}.rgb`), out)
    if (tag !== 's0') continue
    // What is lost at the default: the photo, paled, with the lost light things in magenta and the lost dark ones in blue.
    const map = Buffer.alloc(count * 3)
    for (let p = 0; p < count; p++) for (let k = 0; k < 3; k++) map[p * 3 + k] = Math.round(rgba[p * 4 + k] * 0.45 + 255 * 0.55)
    for (const thing of lost) for (const p of thing.pixels) { map[p * 3] = thing.sign > 0 ? 230 : 0; map[p * 3 + 1] = thing.sign > 0 ? 0 : 90; map[p * 3 + 2] = thing.sign > 0 ? 160 : 255 }
    fs.writeFileSync(path.join(outDir, `${name}-lost.rgb`), map)
    const original = Buffer.alloc(count * 3)
    for (let p = 0; p < count; p++) for (let k = 0; k < 3; k++) original[p * 3 + k] = rgba[p * 4 + k]
    fs.writeFileSync(path.join(outDir, `${name}-photo.rgb`), original)
    fs.writeFileSync(path.join(outDir, `${name}.size`), `${w} ${h}`)
  }
}

fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 1))
const pct = (k) => (k.n ? `${String(Math.round((k.keptWeight / k.weight) * 100)).padStart(3)}% (${k.kept}/${k.n})`.padEnd(16) : '  -'.padEnd(16))
const band = (b) => (b ? `${b.error.toFixed(1)} (${b.bias >= 0 ? '+' : ''}${b.bias.toFixed(1)})`.padEnd(12) : '-'.padEnd(12))
const head = `${'photo and stage'.padEnd(34)} ${'lights kept'.padEnd(16)} ${'darks kept'.padEnd(16)} ${'L dark'.padEnd(12)} ${'L mid'.padEnd(12)} ${'L light'.padEnd(12)} pale: modelling steps paper   areas specks  dE`
const rows = Object.entries(metrics).map(([k, m]) =>
  `${k.padEnd(34)} ${pct(m.lightsKept)} ${pct(m.darksKept)} ${band(m.tone[0])} ${band(m.tone[1])} ${band(m.tone[2])} ${(m.pale ? `${m.pale.modelling.toFixed(2).padStart(15)} ${String(m.pale.steps).padStart(5)} ${`${Math.round(m.pale.paper * 100)}%`.padStart(5)}` : '-'.padStart(27))} ${String(m.areas).padStart(7)} ${String(m.specks).padStart(6)} ${m.dE.toFixed(2).padStart(5)}`)
// The same over all photos, per stage.
const stageNames = [...new Set(Object.keys(metrics).map((k) => k.split(' ')[1]))]
const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : NaN)
// Over all photos together, so that a photo whose lights hardly vary counts for little.
const pooled = (all) => { const pale = all.filter((m) => m.pale); return 1 - pale.reduce((s, m) => s + m.pale.miss, 0) / pale.reduce((s, m) => s + m.pale.spread, 0) }
const summary = stageNames.map((stage) => {
  const all = Object.entries(metrics).filter(([k]) => k.endsWith(` ${stage}`)).map(([, m]) => m)
  const share = (key) => mean(all.filter((m) => m[key].n).map((m) => m[key].keptWeight / m[key].weight)) * 100
  return `${stage.padEnd(16)} lights kept ${share('lightsKept').toFixed(0).padStart(3)}%  darks kept ${share('darksKept').toFixed(0).padStart(3)}%  L error in the lights ${mean(all.filter((m) => m.tone[2]).map((m) => m.tone[2].error)).toFixed(1)}  balanced ${mean(all.map((m) => m.toneBalanced)).toFixed(1)}  modelling of pale zones ${pooled(all).toFixed(2)}  areas ${Math.round(mean(all.map((m) => m.areas)))}  specks ${Math.round(mean(all.map((m) => m.specks)))}  dE ${mean(all.map((m) => m.dE)).toFixed(2)}`
})
const text = [head, ...rows, '', 'All photos:', ...summary].join('\n') + '\n'
fs.writeFileSync(path.join(outDir, 'metrics.txt'), text)
console.log(text)
