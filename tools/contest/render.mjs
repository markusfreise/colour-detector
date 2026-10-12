// usage: node render.mjs <repo path> <out dir>
// Renders the test photos the way the app shows them in mix mode (default settings, and Simplify 4)
// with the library of the given checkout, and writes pictures and figures to compare versions.
import fs from 'node:fs'
import path from 'node:path'
const [repo, outDir] = process.argv.slice(2).map((p) => path.resolve(p))
const here = path.dirname(new URL(import.meta.url).pathname)
const lib = (f) => import(path.join(repo, 'src', f))
const { segmentImage, toOklabPixels, connectedComponents } = await lib('lib/segment.js')
const { hexToRgb, hexToOklab, adjustImage } = await lib('lib/color.js')
const { proposePaints, washRecipe } = await lib('lib/mixing.js')
const { planMixes, mixesToRequest } = await lib('lib/mixes.js')
const { stockPaints } = await lib('data/paints.js')
// Optional: a library may draw its areas with smooth outlines. If src/lib/smooth.js exports
// `upscaleAreas(labels, width, height, scale)` (an Int32Array of labels at `scale` times the size,
// with the same labels), the pictures are drawn from that, as the app then has to do as well.
let upscaleAreas = null
try { upscaleAreas = (await lib('lib/smooth.js')).upscaleAreas ?? null } catch { upscaleAreas = null }
fs.mkdirSync(outDir, { recursive: true })
const PHOTOS = ['meadow', 'family', 'stage', 'portrait', 'street', 'idwal']
const metrics = {}
for (const simplify of [0, 4]) {
  for (const name of PHOTOS) {
    const [w, h] = fs.readFileSync(path.join(here, 'photos', `${name}.size`), 'utf8').trim().split(' ').map(Number)
    const rgba = adjustImage(new Uint8ClampedArray(fs.readFileSync(path.join(here, 'photos', `${name}.raw`))), { saturation: 2 })
    const t0 = performance.now()
    const seg = segmentImage(rgba, w, h, { colours: mixesToRequest(20), simplify })
    const ms = Math.round(performance.now() - t0)
    const candidates = stockPaints.filter((p) => p.enabled)
    const ids = proposePaints(seg.clusters.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount })), candidates, { maxPaints: 3 })
    const box = stockPaints.filter((p) => ids.includes(p.id))
    const byId = Object.fromEntries(box.map((p) => [p.id, p]))
    const mixes = planMixes(seg.clusters, box, { maxPaints: 3, wanted: 20, variety: 5 })
    // The colour every cluster is painted in: its mix with the water its wash needs.
    const hexOf = new Map()
    for (const mix of mixes) for (const c of mix.clusters) hexOf.set(c.index, (mix.recipes[0].paints.length ? washRecipe(mix.recipes[0], c.hex, byId) : mix.recipes[0]).hex)
    const palette = [...new Set(hexOf.values())]
    const count = w * h
    const labels = new Int32Array(count)
    for (let p = 0; p < count; p++) labels[p] = palette.indexOf(hexOf.get(seg.regions[seg.regionMap[p]].cluster) ?? '#ffffff')
    // Areas as the painter sees them: connected pixels of one colour.
    const { regionMap, regionSize } = connectedComponents(labels, w, h)
    const perimeter = new Float64Array(regionSize.length)
    let border = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (x < w - 1 && regionMap[p] !== regionMap[p + 1]) { perimeter[regionMap[p]]++; perimeter[regionMap[p + 1]]++; border++ }
      if (y < h - 1 && regionMap[p] !== regionMap[p + w]) { perimeter[regionMap[p]]++; perimeter[regionMap[p + w]]++; border++ }
    }
    // Raggedness: outline length of all areas against the outline they would have as discs (1 = as round as can be).
    let round = 0, outline = 0
    regionSize.forEach((s, r) => { round += 2 * Math.sqrt(Math.PI * s); outline += perimeter[r] })
    const lab = toOklabPixels(rgba, count)
    const labOf = palette.map(hexToOklab)
    let dE = 0
    for (let p = 0; p < count; p++) { const c = labOf[labels[p]] ?? [1, 0, 0]; dE += Math.hypot(c[0] - lab[p * 3], c[1] - lab[p * 3 + 1], c[2] - lab[p * 3 + 2]) }
    metrics[`${name}-s${simplify}`] = {
      ms, mixes: mixes.length, colours: palette.length,
      areas: regionSize.length,
      specks: regionSize.filter((s) => s < 40).length, // areas too small for a brush
      smallAreas: regionSize.filter((s) => s < 200).length,
      borderPer1000px: +(border / count * 1000).toFixed(1), // how much outline there is in the picture
      raggedness: +(outline / round).toFixed(2),
      meanDeltaE: +(dE / count * 100).toFixed(2), // distance of the flat picture to the photo
    }
    // The picture at twice the size with the outlines of the areas, as the app draws it.
    const S = 2
    const W = w * S, H = h * S
    const out = Buffer.alloc(W * H * 3)
    const rgb = palette.map(hexToRgb)
    let big = upscaleAreas ? upscaleAreas(labels, w, h, S) : null
    if (big && big.length !== W * H) big = null
    if (!big) {
      big = new Int32Array(W * H)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) big[y * W + x] = labels[(y >> 1) * w + (x >> 1)]
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, c = rgb[big[p]] ?? [255, 255, 255]
      const line = (x < W - 1 && big[p] !== big[p + 1]) || (y < H - 1 && big[p] !== big[p + W])
      for (let k = 0; k < 3; k++) out[p * 3 + k] = line ? Math.round(c[k] * 0.45 + [40, 36, 30][k] * 0.55) : c[k]
    }
    fs.writeFileSync(path.join(outDir, `${name}-s${simplify}.rgb`), out)
    fs.writeFileSync(path.join(outDir, `${name}-s${simplify}.size`), `${w * S} ${h * S}`)
  }
}
// The app passes "focus" boxes once an AI plan names details (faces, mostly): inside them areas stay
// fine. Measured on the family photo with boxes on the faces, at both settings.
{
  const BOXES = [[0.29, 0.27, 0.43, 0.52], [0.24, 0.42, 0.31, 0.58], [0.50, 0.46, 0.62, 0.66], [0.75, 0.29, 0.92, 0.50]]
  const [w, h] = fs.readFileSync(path.join(here, 'photos', 'family.size'), 'utf8').trim().split(' ').map(Number)
  const rgba = adjustImage(new Uint8ClampedArray(fs.readFileSync(path.join(here, 'photos', 'family.raw'))), { saturation: 2 })
  for (const simplify of [0, 4]) {
    const t0 = performance.now()
    const seg = segmentImage(rgba, w, h, { colours: mixesToRequest(20), simplify, focus: BOXES })
    const ms = Math.round(performance.now() - t0)
    const inBox = new Set()
    for (const [l, t, r, b] of BOXES) for (let y = Math.floor(t * h); y < Math.ceil(b * h); y++) for (let x = Math.floor(l * w); x < Math.ceil(r * w); x++) inBox.add(seg.regionMap[y * w + x])
    const sizes = [...inBox].map((r) => seg.regions[r].size)
    metrics[`family-s${simplify}-focus`] = { ms, areasInBoxes: sizes.length, specksInBoxes: sizes.filter((s) => s < 40).length, areas: seg.regions.length }
  }
}
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 1))
const rows = Object.entries(metrics).map(([k, m]) => k.endsWith('-focus') ? `${k.padEnd(16)} ${String(m.ms).padStart(5)} ms  areas in the face boxes ${m.areasInBoxes}  specks in the boxes ${m.specksInBoxes}  areas in all ${m.areas}` : `${k.padEnd(12)} ${String(m.ms).padStart(5)} ms  areas ${String(m.areas).padStart(5)}  specks ${String(m.specks).padStart(5)}  border ${String(m.borderPer1000px).padStart(6)}  ragged ${m.raggedness}  dE ${m.meanDeltaE}`)
fs.writeFileSync(path.join(outDir, 'metrics.txt'), rows.join('\n') + '\n')
console.log(rows.join('\n'))
