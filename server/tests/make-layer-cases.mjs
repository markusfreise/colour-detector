// Writes server/tests/layer-cases.json: requests for api/mix/layers as layerImage (src/lib/layers.js)
// sends them, and what the reference (planLayersFor in src/lib/layerPlan.js) answers. The PHP port
// (server/mix/layers.php) is checked against them by layers.test.php.
//
// Run from the repo root after a change to the planning: node server/tests/make-layer-cases.mjs

import { writeFileSync } from 'node:fs'
import { layerImage } from '../../src/lib/layers.js'
import { planLayersFor } from '../../src/lib/layerPlan.js'
import { mulberry32 } from '../../src/lib/segment.js'
import { stockPaints } from '../../src/data/paints.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }
const black = { id: 'k', hex: '#1b1811' }
const pale = { id: 'p', hex: '#b9cde6' }

function makeImage(width, height, fn) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 4
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255
    }
  return rgba
}

// Something like a photo: a sky going down to a horizon, fields, a few houses with red roofs and
// dark windows, a yellow field, thin dark lines, a little grain.
function landscape(width, height, seed) {
  const rand = mulberry32(seed)
  const clamp = (v) => Math.max(0, Math.min(255, v))
  return makeImage(width, height, (x, y) => {
    const u = x / width, v = y / height
    const grain = (rand() - 0.5) * 14
    let c
    if (v < 0.42) c = [120 + v * 220, 165 + v * 140, 225 - v * 40]
    else if (v < 0.55) c = [70 + u * 40, 110 + u * 30, 60]
    else if (u > 0.6 && v > 0.7) c = [235, 205 + v * 20, 40]
    else c = [95 + 40 * Math.sin(u * 9), 135 + 25 * Math.cos(v * 7), 70 + u * 30]
    const house = Math.floor(u * 8)
    if (house % 3 === 1 && v > 0.36 && v < 0.6 && (u * 8) % 1 < 0.7) {
      c = v < 0.43 ? [175, 55, 40] : [225, 215, 195]
      if (v > 0.47 && v < 0.53 && (u * 40) % 1 < 0.35) c = [35, 30, 40]
    }
    if ((x + 2 * y) % 97 < 2 && v > 0.55) c = [30, 35, 25]
    if (Math.hypot(u - 0.8, v - 0.15) < 0.05) c = [252, 245, 210]
    return [clamp(c[0] + grain), clamp(c[1] + grain), clamp(c[2] + grain)]
  })
}

const cases = []
async function record(name, rgba, width, height, paints, options) {
  await layerImage(rgba, width, height, paints, options, (request) => {
    const plain = JSON.parse(JSON.stringify(request))
    const answer = JSON.parse(JSON.stringify(planLayersFor(plain)))
    cases.push({ name, request: plain, answer })
    return answer
  })
}

const rand = mulberry32(3)
await record('bands of one paint', makeImage(80, 40, (x) => [[255, 255, 255], [190, 205, 230], [140, 165, 205], [100, 130, 185]][Math.floor(x / 20)]), 80, 40, [blue], { paintIds: ['b'], simplify: 0 })
await record('proposal of two from three', makeImage(40, 40, (x, y) => [[255, 255, 255], [250, 240, 140], [150, 180, 220], [120, 170, 90]][(x < 20 ? 0 : 1) + (y < 20 ? 0 : 2)]), 40, 40, [yellow, blue, red], { count: 2, simplify: 0 })
await record('noise, no accents', makeImage(64, 48, (x, y) => [40 + ((x * 3) % 200) + rand() * 15, 60 + y * 3 + rand() * 15, 220 - x * 2]), 64, 48, [yellow, blue, red, black], { count: 3, simplify: 2, accents: 0 })
await record('thin dark lines, accents', makeImage(120, 120, (x, y) => ((x + 2 * y) % 80 < 3 ? [30, 30, 35] : [185, 205, 230])), 120, 120, [blue, black], { paintIds: ['b', 'k'], maxCoats: 2, simplify: 4, accents: 2 })
await record('graded coats', makeImage(60, 30, (x) => [[230, 238, 248], [150, 180, 220], [60, 100, 170]][Math.floor(x / 20)]), 60, 30, [blue, pale], { paintIds: ['b', 'p'], graded: true, accents: 0 })
await record('one pixel', makeImage(1, 1, () => [40, 90, 160]), 1, 1, [yellow, blue], { paintIds: ['y', 'b'], simplify: 4 })
await record('white paper', makeImage(12, 8, () => [255, 255, 255]), 12, 8, [yellow, blue], { paintIds: ['y', 'b'] })

const pool = stockPaints.slice(0, 30).map(({ id, hex }) => ({ id, hex }))
const big = landscape(480, 360, 7)
await record('landscape, proposal of four from 30', big, 480, 360, pool, { count: 4, simplify: 4, accents: 2 })
const proposed = cases.at(-1).answer.layers.map((l) => l.paintId)
await record('landscape, the proposed paints given', big, 480, 360, pool, { paintIds: [...new Set(proposed)], simplify: 4, accents: 2 })
await record('landscape, proposal without accents, four coats', landscape(320, 240, 11), 320, 240, pool.slice(0, 20), { count: 3, maxCoats: 4, simplify: 6, accents: 0 })

const json = JSON.stringify({ made: 'node server/tests/make-layer-cases.mjs', cases })
writeFileSync(new URL('./layer-cases.json', import.meta.url), json)
console.log(`${cases.length} cases, ${(json.length / 1e6).toFixed(2)} MB`)
