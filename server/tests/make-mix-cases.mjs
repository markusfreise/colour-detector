// Writes server/tests/mix-cases.json: requests to the mixing service and the answers of the
// reference in src/lib/mixService.js. server/tests/mix.test.php checks that the PHP port
// (server/mix/) answers the same. Run from the root of the repo after a change to the mixing:
//   node server/tests/make-mix-cases.mjs

import { writeFileSync } from 'node:fs'
import { stockPaints } from '../../src/data/paints.js'
import { starterPaints } from '../../src/data/starter.js'
import { segmentImage, mulberry32, mixesToRequest } from '../../src/lib/segment.js'
import { adjustImage } from '../../src/lib/color.js'
import { propose, plan, recipes } from '../../src/lib/mixService.js'

const plain = ({ id, hex }) => ({ id, hex })
const stock = stockPaints.map(plain)
const starter = starterPaints.map(plain)
// A paint box as a painter keeps it: the stock paints that are on by default, or the first twelve.
const enabled = stockPaints.filter((p) => p.enabled).map(plain)
const box = enabled.length >= 6 ? enabled : stock.slice(0, 12)

// Pictures the analysis can find mixes and washes in: soft gradients, blocks of colour, noise.
function picture(width, height, seed, kind) {
  const rand = mulberry32(seed)
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      let c
      if (kind === 'landscape') {
        // Sky, hills, a field, a red roof.
        if (y < height * 0.4) c = [120 + y, 170 + y * 0.5, 230]
        else if (y < height * 0.6) c = [70 + x * 0.3, 110, 60]
        else c = [190 - y * 0.4, 170, 70]
        if (x > width * 0.6 && x < width * 0.75 && y > height * 0.45 && y < height * 0.6) c = [180, 50, 40]
      } else if (kind === 'portrait') {
        const dx = x - width / 2, dy = y - height / 2
        c = dx * dx + dy * dy < (width * width) / 12 ? [225 - dy * 0.5, 180 - dy * 0.5, 150] : [60, 70 + x * 0.4, 90]
      } else {
        c = [(x * 255) / width, (y * 255) / height, ((x + y) % 120) + 60]
      }
      rgba[i] = c[0] + rand() * 14
      rgba[i + 1] = c[1] + rand() * 14
      rgba[i + 2] = c[2] + rand() * 14
      rgba[i + 3] = 255
    }
  }
  return rgba
}

const W = 96, H = 72
const clustersOf = (rgba, options) =>
  segmentImage(rgba, W, H, options).clusters.map(({ index, group, hex, pixelCount }) => ({ index, group, hex, pixelCount }))
const scenes = ['landscape', 'portrait', 'gradient'].map((kind, n) => {
  const rgba = picture(W, H, 11 + n, kind)
  const grey = adjustImage(rgba, { saturation: 0, contrast: 1 })
  return {
    kind,
    colour: clustersOf(rgba, { colours: mixesToRequest(12), simplify: 4 }),
    values: clustersOf(grey, { colours: 1, maxWashes: 24, washStep: 0.15, simplify: 4 }),
  }
})

const cases = []
const add = (route, request, answer) => cases.push({ route, request, answer: answer(request) })

for (const scene of scenes) {
  const targets = scene.colour.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
  add('propose', { targets, paints: stock.slice(0, 40), maxPaints: 3, values: false }, propose)
  add('propose', { targets: targets.slice(0, 10), paints: starter, maxPaints: 2, values: false }, propose)
  for (const [paints, variety] of [[box, 5], [starter, 0], [stock.slice(20, 44), 10]]) {
    add('plan', { clusters: scene.colour, paints, maxPaints: 3, wanted: 12, variety, values: false }, plan)
  }
  add('plan', { clusters: scene.colour, paints: box, maxPaints: 2, wanted: 6, variety: 3, values: false }, plan)
  add('plan', { clusters: scene.values, paints: box.slice(0, 6), maxPaints: 3, wanted: 4, variety: 5, values: true }, plan)
}
// Value mode with paints that do not reach the darks: the values are spread over what they reach.
const yellows = stock.filter((p) => /^#(f|e)/i.test(p.hex)).slice(0, 2)
add('plan', { clusters: scenes[0].values, paints: yellows.length ? yellows : stock.slice(0, 1), maxPaints: 3, wanted: 4, variety: 5, values: true }, plan)
add('propose', { targets: scenes[1].values.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount })), paints: starter, maxPaints: 3, values: true }, propose)
add('plan', { clusters: [], paints: box, maxPaints: 3, wanted: 12, variety: 5, values: false }, plan)
add('plan', { clusters: scenes[0].colour, paints: [], maxPaints: 3, wanted: 12, variety: 5, values: false }, plan)

// Single colours: own colours from the colour picker, one paint (the dark of the AI details),
// washes of a mix, value mode, no paints.
const washed = cases.find((c) => c.route === 'plan' && c.answer.mixes.length).answer.mixes[0].recipes
const hexes = ['#123456', '#f0e0c0', '#7a3b2e', '#ffffff', '#000000', '#3c8d5a', '#d81b60', '#8090a0']
add('recipes', {
  paints: box,
  jobs: [
    ...hexes.map((hex) => ({ hex, maxPaints: 3, limit: 5 })),
    ...hexes.slice(0, 3).map((hex) => ({ hex, maxPaints: 2, limit: 5, values: true })),
    { hex: '#223344', maxPaints: 1, limit: 1, only: [box[box.length - 1].id] },
    { hex: '#223344', maxPaints: 3, limit: 5, only: ['no-such-paint'] },
    ...hexes.slice(2, 6).map((hex) => ({ hex, wash: washed })),
    { hex: '#c0d0e0', wash: washed, values: true },
  ],
}, recipes)
add('recipes', { paints: starter, jobs: hexes.map((hex) => ({ hex, maxPaints: 3, limit: 8 })) }, recipes)
add('recipes', { paints: [], jobs: [{ hex: '#808080', maxPaints: 3, limit: 5 }] }, recipes)

const json = JSON.stringify({ made: 'node server/tests/make-mix-cases.mjs', cases })
writeFileSync(new URL('./mix-cases.json', import.meta.url), json)
console.log(`${cases.length} cases, ${(json.length / 1024).toFixed(0)} KB`)
