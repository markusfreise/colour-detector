import { describe, it, expect } from 'vitest'
import { colourSet, pictureColours, proposeLayerPaints, fitLayers, layerImage, compositeColours, renderLayers, coatDepth, washGuide } from '../lib/layers.js'
import { absorbanceFromHex, depthLimit, depth, mixHex } from '../lib/mixing.js'
import { hexToRgb, hexToOklab, rgbToHex, linearToRgb, deltaE } from '../lib/color.js'
import { mulberry32 } from '../lib/segment.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }
const black = { id: 'k', hex: '#706c63' }

// Dried washes over each other on white paper: [paint, amount of paint] per layer.
function glaze(...washes) {
  const linear = [1, 1, 1]
  for (const [paint, amount] of washes) {
    const A = absorbanceFromHex(paint.hex)
    const d = depth(amount, depthLimit(A))
    A.forEach((v, j) => { linear[j] *= Math.exp(-d * v) })
  }
  return rgbToHex(linearToRgb(linear))
}

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

// Four vertical bands: paper, then one, two and three coats of a blue wash.
const WASH = 0.3
const bands = ['#ffffff', glaze([blue, WASH]), glaze([blue, 2 * WASH]), glaze([blue, 3 * WASH])].map(hexToRgb)
const bandImage = () => makeImage(80, 40, (x) => bands[Math.floor(x / 20)])

describe('fitting layers to colours', () => {
  it('finds the wash and counts the coats of a single paint', () => {
    const colours = colourSet([1, 2, 3].map((c) => ({ hex: glaze([blue, c * WASH]) })))
    const fit = fitLayers(colours, [blue])
    expect(fit.layers).toHaveLength(1)
    expect(fit.layers[0].paintId).toBe('b')
    expect(fit.layers[0].strength).toBeCloseTo(WASH, 1)
    expect(fit.coats).toEqual([[1], [2], [3]])
    expect(Math.max(...fit.deltaE)).toBeLessThan(1)
    // The colour of two coats is the colour of a single wash with twice the paint.
    expect(deltaE(hexToOklab(fit.layers[0].hexes[2]), hexToOklab(mixHex([blue], [2 * WASH])))).toBeLessThan(1)
  })

  it('paints a green as yellow and blue over each other', () => {
    const green = glaze([yellow, 0.5], [blue, 0.3])
    const fit = fitLayers(colourSet([{ hex: glaze([yellow, 0.5]) }, { hex: glaze([blue, 0.3]) }, { hex: green }]), [blue, yellow])
    // Light to dark: the yellow layer comes first.
    expect(fit.layers.map((l) => l.paintId)).toEqual(['y', 'b'])
    const [onlyYellow, onlyBlue, both] = fit.coats
    expect(onlyYellow[0]).toBeGreaterThan(0)
    expect(onlyYellow[1]).toBe(0)
    expect(onlyBlue[0]).toBe(0)
    expect(onlyBlue[1]).toBeGreaterThan(0)
    expect(both[0]).toBeGreaterThan(0)
    expect(both[1]).toBeGreaterThan(0)
    expect(fit.deltaE[2]).toBeLessThan(2)
    expect(deltaE(hexToOklab(fit.hexes[2]), hexToOklab(green))).toBeLessThan(2)
  })

  it('leaves white unpainted', () => {
    const fit = fitLayers(colourSet([{ hex: '#ffffff', weight: 5 }, { hex: glaze([blue, 0.4]) }, { hex: glaze([yellow, 0.4]) }]), [yellow, blue])
    expect(fit.coats[0]).toEqual([0, 0])
    expect(fit.hexes[0]).toBe('#ffffff')
  })

  it('reaches a dark with separate layers that one wet mix of bright paints cannot reach', () => {
    const dark = glaze([red, 3], [blue, 3], [yellow, 3])
    const fit = fitLayers(colourSet([{ hex: dark }]), [red, blue, yellow])
    expect(fit.deltaE[0]).toBeLessThan(3)
    expect(deltaE(hexToOklab(mixHex([red, blue, yellow], [4, 4, 4])), hexToOklab(dark))).toBeGreaterThan(10)
  })

  it('does not let coats of a bright paint drift past its masstone', () => {
    const colours = colourSet([1, 2, 3, 4].map((c) => ({ hex: glaze([yellow, c * 0.2]) })))
    const [layer] = fitLayers(colours, [yellow], { maxCoats: 4, accents: 0 }).layers
    const limit = depthLimit(absorbanceFromHex(yellow.hex))
    expect(layer.top).toBeGreaterThan(1)
    expect(layer.depths[4]).toBeLessThanOrEqual(limit)
    expect(coatDepth(40, 1, limit)).toBeLessThanOrEqual(limit)
    // depths grow with the coats the layer has, and stay there
    for (let c = 1; c <= 4; c++) {
      if (c <= layer.top) expect(layer.depths[c]).toBeGreaterThan(layer.depths[c - 1])
      else expect(layer.depths[c]).toBe(layer.depths[layer.top])
    }
  })

  it('grades the coats only when asked to', () => {
    // A very light and a deep blue: one wash painted up to three times cannot do both well.
    const colours = colourSet([{ hex: glaze([blue, 0.08]) }, { hex: glaze([blue, 0.4]) }, { hex: glaze([blue, 2]) }])
    const even = fitLayers(colours, [blue], { accents: 0 })
    const graded = fitLayers(colours, [blue], { graded: true, accents: 0 })
    expect(even.layers[0].ratio).toBe(1)
    expect(new Set(even.layers[0].washes.map((w) => w.strength)).size).toBe(1)
    expect(graded.layers[0].ratio).toBeGreaterThan(1.5)
    expect(graded.layers[0].washes[2].strength).toBeGreaterThan(graded.layers[0].washes[0].strength)
    expect(graded.error).toBeLessThan(even.error - 1)
  })
})

describe('proposing base paints', () => {
  const colours = colourSet([
    { hex: glaze([yellow, 0.5]), weight: 3 },
    { hex: glaze([blue, 0.4]), weight: 3 },
    { hex: glaze([yellow, 0.5], [blue, 0.4]), weight: 3 },
    { hex: glaze([yellow, 1], [blue, 0.8]), weight: 2 },
  ])

  it('picks the paints the colours are made of', () => {
    expect(proposeLayerPaints(colours, [red, black, blue, yellow], { count: 2 })).toEqual(['y', 'b'])
  })
  it('never proposes more paints than there are', () => {
    expect(proposeLayerPaints(colours, [blue], { count: 3 })).toEqual(['b'])
    expect(proposeLayerPaints(colours, [], { count: 3 })).toEqual([])
  })
})

describe('layers of a picture', () => {
  it('turns bands of one, two and three coats into nested coats', () => {
    const res = layerImage(bandImage(), 80, 40, [blue], { paintIds: ['b'], simplify: 0 })
    const [layer] = res.layers
    expect(layer.strength).toBeCloseTo(WASH, 1)
    for (let x = 0; x < 80; x++) expect(layer.coatMap[10 * 80 + x]).toBe(Math.floor(x / 20))
    // Coat 2 lies inside coat 1, coat 3 inside coat 2.
    expect(layer.coats.map((c) => c.share)).toEqual([0.75, 0.5, 0.25])
    expect(layer.coats.map((c) => c.only)).toEqual([0.25, 0.25, 0.25])
    expect(res.steps.map((s) => [s.layer, s.coat, s.share])).toEqual([[0, 1, 0.75], [0, 2, 0.5], [0, 3, 0.25]])
    expect(res.steps[0].dilution).toBe(layer.dilution)
    // One area per band, each with its coat count and an anchor inside it.
    expect(layer.regions.map((r) => r.coats).sort()).toEqual([0, 1, 2, 3])
    for (const r of layer.regions) {
      expect(r.size).toBe(800)
      expect(layer.regionMap[r.anchorY * 80 + r.anchorX]).toBe(r.id)
      expect(layer.coatMap[r.anchorY * 80 + r.anchorX]).toBe(r.coats)
    }
    expect(res.deltaE.mean).toBeLessThan(1)
  })

  it('leaves white paper unpainted and lists the combinations that occur', () => {
    const green = hexToRgb(glaze([yellow, 0.5], [blue, 0.3]))
    const cells = [[255, 255, 255], hexToRgb(glaze([yellow, 0.5])), hexToRgb(glaze([blue, 0.3])), green]
    const rgba = makeImage(40, 40, (x, y) => cells[(x < 20 ? 0 : 1) + (y < 20 ? 0 : 2)])
    const res = layerImage(rgba, 40, 40, [yellow, blue, red], { count: 2, simplify: 0 })
    expect(res.paintIds).toEqual(['y', 'b'])
    expect(res.layers[0].coatMap[0]).toBe(0)
    expect(res.layers[1].coatMap[0]).toBe(0)
    expect(res.combos).toHaveLength(4)
    expect(res.combos.reduce((sum, c) => sum + c.pixelCount, 0)).toBe(1600)
    const paper = res.combos[res.comboMap[0]]
    expect(paper.coats).toEqual([0, 0])
    expect(paper.hex).toBe('#ffffff')
    const both = res.combos[res.comboMap[39 * 40 + 39]]
    expect(both.coats.every((c) => c > 0)).toBe(true)
    expect(deltaE(hexToOklab(both.hex), hexToOklab(rgbToHex(green)))).toBeLessThan(2)
    expect(res.deltaE.p95).toBeLessThan(2)
  })

  it('merges specks into the area around them, layer by layer', () => {
    const wash = hexToRgb(glaze([blue, 0.6]))
    const rgba = makeImage(60, 60, (x, y) => ((x * 7 + y * 13) % 97 === 0 ? [255, 255, 255] : wash))
    const res = layerImage(rgba, 60, 60, [blue], { paintIds: ['b'], simplify: 4 })
    expect(res.layers[0].regions).toHaveLength(1)
    expect(res.combos).toHaveLength(1)
  })

  it('is deterministic', () => {
    const rand = mulberry32(3)
    const rgba = makeImage(64, 48, (x, y) => [40 + ((x * 3) % 200) + rand() * 15, 60 + y * 3 + rand() * 15, 220 - x * 2])
    const run = () => layerImage(rgba, 64, 48, [yellow, blue, red, black], { count: 3, simplify: 2, accents: 0 })
    const a = run(), b = run()
    expect(a.paintIds).toEqual(b.paintIds)
    expect(a.layers.map((l) => l.strength)).toEqual(b.layers.map((l) => l.strength))
    expect(a.comboMap).toEqual(b.comboMap)
    expect(a.combos).toEqual(b.combos)
    expect(a.steps).toEqual(b.steps)
    // The same washes, proposed from the colours of the picture alone.
    expect(proposeLayerPaints(pictureColours(rgba, 64, 48), [yellow, blue, red, black], { count: 3, accents: 0 })).toEqual(a.paintIds)
  })

  it('shows any subset of the layers', () => {
    const rand = mulberry32(5)
    const rgba = makeImage(48, 48, (x, y) => [250 - x * 3 + rand() * 10, 240 - y * 2, 60 + x * 2 + y])
    const res = layerImage(rgba, 48, 48, [yellow, blue, red], { paintIds: ['y', 'b', 'r'], simplify: 2 })
    const hexAt = (img, p) => rgbToHex([img[p * 4], img[p * 4 + 1], img[p * 4 + 2]])
    const all = renderLayers(res)
    const none = renderLayers(res, [false, false, false])
    const first = renderLayers(res, [true, false, false])
    const firstTwo = renderLayers(res, [true, true, false])
    for (let p = 0; p < 48 * 48; p += 7) {
      expect(hexAt(all, p)).toBe(res.combos[res.comboMap[p]].hex)
      expect(hexAt(none, p)).toBe('#ffffff')
      // One layer alone shows its coats as they look on white paper.
      expect(hexAt(first, p)).toBe(res.layers[0].hexes[res.layers[0].coatMap[p]])
      expect(all[p * 4 + 3]).toBe(255)
    }
    // Two layers: the product of their filters, whatever the third one does.
    const pair = compositeColours(res.layers.slice(0, 2), res.combos.map((c) => ({ coats: c.coats.slice(0, 2) })))
    const p = 48 * 20 + 30, c = res.comboMap[p]
    expect([firstTwo[p * 4], firstTwo[p * 4 + 1], firstTwo[p * 4 + 2]]).toEqual([pair[c * 3], pair[c * 3 + 1], pair[c * 3 + 2]])
    // The combination index of a pixel is the coats of its layers.
    res.layers.forEach((layer, k) => expect(res.combos[c].coats[k]).toBe(layer.coatMap[p]))
  })
})

describe('the price of work', () => {
  it('prefers one strong wash to several weak coats', () => {
    const fit = fitLayers(colourSet([{ hex: glaze([blue, 0.8]) }]), [blue], { maxCoats: 3 })
    const [layer] = fit.layers
    expect(layer.top).toBe(1)
    expect(layer.strength).toBeCloseTo(0.8, 1)
    expect(fit.coats).toEqual([[1]])
    expect(fit.deltaE[0]).toBeLessThan(1)
  })

  it('does not use a paint that buys nothing, and proposes fewer paints than asked for', () => {
    const colours = colourSet([{ hex: glaze([blue, 0.3]) }, { hex: glaze([blue, 0.6]) }])
    const fit = fitLayers(colours, [red, blue])
    // The paint that is not needed stays in the list, last and without coats.
    expect(fit.layers.map((l) => [l.paintId, l.top > 0])).toEqual([['b', true], ['r', false]])
    expect(fit.layers[1].hexes).toEqual(['#ffffff', '#ffffff', '#ffffff', '#ffffff'])
    expect(fit.coats.every((c) => c[1] === 0)).toBe(true)
    expect(proposeLayerPaints(colours, [red, black, blue, yellow], { count: 3 })).toEqual(['b'])
  })

  it('leaves out a tint nobody would see', () => {
    // Paper with the faintest breath of blue: not worth a wash and its drying time.
    const fit = fitLayers(colourSet([{ hex: glaze([blue, 0.004]) }]), [blue])
    expect(fit.layers[0].top).toBe(0)
    expect(fit.coats).toEqual([[0]])
  })

  it('says how to prepare a wash', () => {
    expect(washGuide(1)).toEqual({ water: 4, consistency: 'milk', guide: '1 part paint to 4 parts water, like milk' })
    expect(washGuide(0.2).water).toBe(20)
    expect(washGuide(0.2).consistency).toBe('tea')
    expect(washGuide(0.075).water).toBe(50)
    expect(washGuide(4).consistency).toBe('butter')
    expect(washGuide(0).guide).toBe('clear water')
    // more paint, less water
    const waters = [0.05, 0.1, 0.3, 0.7, 1.5, 3].map((s) => washGuide(s).water)
    for (let i = 1; i < waters.length; i++) expect(waters[i]).toBeLessThan(waters[i - 1])
    const [layer] = fitLayers(colourSet([{ hex: glaze([blue, 0.8]) }]), [blue]).layers
    expect(layer.guide).toBe(washGuide(layer.strength).guide)
    expect(layer.washes[0].guide).toBe(layer.guide)
  })
})

describe('accents', () => {
  // A pale blue picture with a little very dark: too small for a wash layer of its own.
  const colours = colourSet([
    { hex: glaze([blue, 0.15]), weight: 600 },
    { hex: glaze([blue, 0.3]), weight: 397 },
    { hex: glaze([blue, 0.3], [black, 3.5]), weight: 3 },
  ])

  it('gives the small dark part a strong wash of its own, painted last', () => {
    const fit = fitLayers(colours, [black, blue], { maxCoats: 2, accents: 2 })
    expect(fit.layers.map((l) => [l.paintId, l.kind])).toEqual([['b', 'wash'], ['k', 'accent']])
    const [wash, accent] = fit.layers
    expect(accent.top).toBe(1)
    expect(accent.strength).toBeGreaterThan(1)
    expect(accent.strength).toBeGreaterThan(wash.strength * 3)
    expect(fit.coats[2][1]).toBe(1)
    expect(fit.coats[0][1]).toBe(0)
    expect(fit.coats[1][1]).toBe(0)
    expect(fit.deltaE[2]).toBeLessThan(8)
  })

  it('plans only washes at variety 0', () => {
    const fit = fitLayers(colours, [black, blue], { maxCoats: 2, accents: 0 })
    expect(fit.layers.every((l) => l.kind === 'wash')).toBe(true)
    expect(fit.deltaE[2]).toBeGreaterThan(20)
  })

  it('lets an accent of a wash paint only add what is left up to the limit of the paint', () => {
    const deep = colourSet([
      { hex: glaze([blue, 0.15]), weight: 600 },
      { hex: glaze([blue, 0.3]), weight: 397 },
      { hex: glaze([blue, 3.5]), weight: 3 },
    ])
    const fit = fitLayers(deep, [blue], { maxCoats: 2, accents: 2 })
    expect(fit.layers.map((l) => l.kind)).toEqual(['wash', 'accent'])
    const [wash, accent] = fit.layers
    const limit = depthLimit(absorbanceFromHex(blue.hex))
    expect(wash.depths[wash.top] + accent.depths[1]).toBeLessThanOrEqual(limit + 1e-9)
    expect(fit.coats[2]).toEqual([wash.top, 1])
  })

  it('keeps thin dark lines that the blur of the washes wipes out', () => {
    const pale = hexToRgb(glaze([blue, 0.2])), dark = hexToRgb(glaze([blue, 0.2], [black, 3.5]))
    // 3 px lines, 40 px apart: a few percent of the picture.
    const rgba = makeImage(120, 120, (x, y) => ((x + 2 * y) % 80 < 3 ? dark : pale))
    const plain = layerImage(rgba, 120, 120, [blue, black], { paintIds: ['b', 'k'], maxCoats: 2, simplify: 4, accents: 0 })
    const res = layerImage(rgba, 120, 120, [blue, black], { paintIds: ['b', 'k'], maxCoats: 2, simplify: 4, accents: 2 })
    expect(plain.layers.some((l) => l.kind === 'accent')).toBe(false)
    const accent = res.layers.find((l) => l.kind === 'accent' && l.role === 'dark')
    expect(accent.paintId).toBe('k')
    // Layers in painting order: washes first, the accent after them, and its step last.
    expect(res.layers[0]).toMatchObject({ kind: 'wash', paintId: 'b' })
    const kinds = res.steps.map((s) => s.kind)
    expect(kinds.lastIndexOf('wash')).toBeLessThan(kinds.indexOf('accent'))
    expect(res.steps[res.steps.length - 1]).toMatchObject({ kind: 'accent', paintId: 'k', coat: 1 })
    expect(accent.coats[0].shapes).toBeLessThanOrEqual(24)
    // On the lines, not on the field.
    let onLine = 0, lines = 0, onField = 0, field = 0
    for (let y = 10; y < 110; y++) for (let x = 10; x < 110; x++) {
      const line = (x + 2 * y) % 80 === 1
      const away = (x + 2 * y) % 80 > 12 && (x + 2 * y) % 80 < 70
      if (line) { lines++; onLine += accent.coatMap[y * 120 + x] }
      if (away) { field++; onField += accent.coatMap[y * 120 + x] }
    }
    expect(onLine / lines).toBeGreaterThan(0.8)
    expect(onField / field).toBeLessThan(0.01)
    expect(res.deltaE.mean).toBeLessThan(plain.deltaE.mean)
    expect(accent.buys.areaWithout - accent.buys.areaWith).toBeGreaterThan(10)
  })
})

describe('what a plan says about itself', () => {
  // Two blue squares on white; one of them is deeper in its middle.
  const one = hexToRgb(glaze([blue, 0.3])), two = hexToRgb(glaze([blue, 0.6]))
  const inside = (x, y, x0, y0, size) => x >= x0 && x < x0 + size && y >= y0 && y < y0 + size
  const rgba = makeImage(80, 40, (x, y) => (inside(x, y, 10, 10, 20) ? two : inside(x, y, 5, 5, 30) || inside(x, y, 45, 5, 30) ? one : [255, 255, 255]))
  const res = layerImage(rgba, 80, 40, [blue, red], { paintIds: ['b', 'r'], maxCoats: 2, simplify: 0, accents: 0 })

  it('counts the separate shapes of every step', () => {
    expect(res.steps.map((s) => [s.paintId, s.coat, s.shapes])).toEqual([['b', 1, 2], ['b', 2, 1]])
    expect(res.layers[0].coats.map((c) => c.shapes)).toEqual([2, 1])
    for (const step of res.steps) {
      expect(step.guide).toBe(res.layers[step.layer].guide)
      expect(step.water).toBeGreaterThan(0)
    }
  })

  it('adds up the work', () => {
    expect(res.work.steps).toBe(res.steps.length)
    expect(res.work.area).toBeCloseTo(res.steps.reduce((sum, s) => sum + s.share, 0), 10)
    expect(res.work.area).toBeCloseTo((1800 + 400) / 3200, 10)
  })

  it('says what every layer buys', () => {
    const [used, unused] = res.layers
    expect(used.buys.with).toBeCloseTo(res.deltaE.mean, 6)
    expect(used.buys.without).toBeGreaterThan(used.buys.with + 3)
    expect(used.buys.areaWithout).toBeGreaterThan(used.buys.areaWith + 5)
    expect(unused.top).toBe(0)
    expect(unused.buys.without).toBeCloseTo(unused.buys.with, 6)
    expect(res.steps.every((s) => s.paintId === 'b')).toBe(true)
  })

  it('proposes the same paints whatever the size of the areas', () => {
    const rand = mulberry32(11)
    const picture = makeImage(96, 64, (x, y) => (x < 48 ? [235 - y + rand() * 12, 190 + rand() * 12, 60 + x] : [70 + rand() * 12, 110 + y, 190 - x + rand() * 12]))
    const pool = [yellow, blue, red, black]
    const ids = [0, 4, 8].map((simplify) => layerImage(picture, 96, 64, pool, { count: 3, simplify }).paintIds)
    expect(ids[1]).toEqual(ids[0])
    expect(ids[2]).toEqual(ids[0])
    // Every proposed paint has something to paint, and planning the proposal again with its
    // paints uses the same paints.
    const first = layerImage(picture, 96, 64, pool, { count: 3, simplify: 4 })
    expect(new Set(first.steps.map((s) => s.paintId)).size).toBe(first.paintIds.length)
    const again = layerImage(picture, 96, 64, pool, { paintIds: first.paintIds, count: 3, simplify: 4 })
    expect(again.paintIds.slice().sort()).toEqual(first.paintIds.slice().sort())
  })
})

describe('what accents are for', () => {
  // Mostly sky blue, a little pure yellow (a third of a percent) and as little very dark.
  const sky = glaze([blue, 0.25]), sun = glaze([yellow, 0.9]), night = glaze([blue, 0.25], [black, 3.5])

  it('gives the first accent to a small colour the washes miss, the second to the darks', () => {
    const colours = colourSet([{ hex: sky, weight: 994 }, { hex: sun, weight: 3 }, { hex: night, weight: 3 }])
    const fit = fitLayers(colours, [blue, black, yellow, red], { maxCoats: 2, accents: 2 })
    const accents = fit.layers.filter((l) => l.kind === 'accent')
    expect(accents.map((l) => [l.paintId, l.role]).sort()).toEqual([['k', 'dark'], ['y', 'colour']])
    // The yellow comes out yellow: on bare paper, not over the blue.
    const k = fit.layers.findIndex((l) => l.paintId === 'y')
    expect(fit.coats[1][k]).toBe(1)
    expect(deltaE(hexToOklab(fit.layers[k].hexes[1]), hexToOklab(sun))).toBeLessThan(8)
  })

  it('only adds to the plan when more accents are allowed', () => {
    const colours = colourSet([{ hex: sky, weight: 994 }, { hex: sun, weight: 3 }, { hex: night, weight: 3 }])
    const plans = [0, 1, 2, 3].map((accents) => fitLayers(colours, [blue, black, yellow, red], { maxCoats: 2, accents }).layers.filter((l) => l.top > 0))
    const key = (l) => [l.kind, l.paintId, l.top, l.strength.toFixed(4)].join(' ')
    expect(plans[0].every((l) => l.kind === 'wash')).toBe(true)
    for (let n = 1; n < plans.length; n++) {
      // the washes are the same, and the accents of the smaller plan are all still there
      for (const layer of plans[n - 1]) expect(plans[n].map(key)).toContain(key(layer))
      expect(plans[n].filter((l) => l.kind === 'accent').length).toBeLessThanOrEqual(n)
    }
  })

  it('keeps a neutral wash off clean colour', () => {
    // A saturated red, a little darker than the red paint gives in one go: grey would darken it
    // numerically, but a painter keeps grey out of a clean red.
    const colours = colourSet([{ hex: glaze([red, 1.5], [black, 0.12]), weight: 60 }, { hex: glaze([black, 0.5]), weight: 40 }])
    const fit = fitLayers(colours, [red, black], { maxCoats: 2, accents: 0 })
    const grey = fit.layers.findIndex((l) => l.paintId === 'k')
    expect(fit.coats[0][grey]).toBe(0)
    expect(fit.coats[1][grey]).toBeGreaterThan(0)
    // The neutral wash is painted after the clean one.
    expect(fit.layers.map((l) => l.paintId)).toEqual(['r', 'k'])
  })

  it('stays off print on white paper', () => {
    const ink = hexToRgb(glaze([black, 3.5])), tint = hexToRgb(glaze([blue, 0.3]))
    // Left: white with thin black strokes (a caption). Right: a blue field with dark strokes.
    const rgba = makeImage(160, 80, (x, y) => {
      const stroke = y > 20 && y < 60 && x % 9 < 2
      return x < 80 ? (stroke ? ink : [255, 255, 255]) : stroke ? ink : tint
    })
    const res = layerImage(rgba, 160, 80, [blue, black], { paintIds: ['b', 'k'], maxCoats: 2, simplify: 2, accents: 2 })
    const accent = res.layers.find((l) => l.kind === 'accent')
    let caption = 0, field = 0
    for (let y = 0; y < 80; y++) for (let x = 0; x < 160; x++) if (accent.coatMap[y * 160 + x]) { if (x < 70) caption++; else if (x >= 90) field++ }
    expect(caption).toBe(0)
    expect(field).toBeGreaterThan(100)
    // The paper of the caption stays white in the whole plan.
    expect(res.combos[res.comboMap[40 * 160 + 4]].hex).toBe('#ffffff')
  })
})
