import { describe, it, expect } from 'vitest'
import { colourSet, pictureColours, proposeLayerPaints, fitLayers, layerImage, compositeColours, renderLayers, coatDepth } from '../lib/layers.js'
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
    const [layer] = fitLayers(colourSet([{ hex: yellow.hex }]), [yellow], { maxCoats: 4 }).layers
    const limit = depthLimit(absorbanceFromHex(yellow.hex))
    expect(layer.depths[4]).toBeLessThanOrEqual(limit)
    expect(coatDepth(40, 1, limit)).toBeLessThanOrEqual(limit)
    // depths grow with the coats
    for (let c = 1; c <= 4; c++) expect(layer.depths[c]).toBeGreaterThan(layer.depths[c - 1])
  })

  it('grades the coats only when asked to', () => {
    // A very light and a deep blue: one wash painted up to three times cannot do both well.
    const colours = colourSet([{ hex: glaze([blue, 0.08]) }, { hex: glaze([blue, 0.4]) }, { hex: glaze([blue, 2]) }])
    const even = fitLayers(colours, [blue])
    const graded = fitLayers(colours, [blue], { graded: true })
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
    const run = () => layerImage(rgba, 64, 48, [yellow, blue, red, black], { count: 3, simplify: 2 })
    const a = run(), b = run()
    expect(a.paintIds).toEqual(b.paintIds)
    expect(a.layers.map((l) => l.strength)).toEqual(b.layers.map((l) => l.strength))
    expect(a.comboMap).toEqual(b.comboMap)
    expect(a.combos).toEqual(b.combos)
    expect(a.steps).toEqual(b.steps)
    // The same paints, proposed from the colours of the picture alone.
    expect(proposeLayerPaints(pictureColours(rgba, 64, 48, { simplify: 2 }), [yellow, blue, red, black], { count: 3 })).toEqual(a.paintIds)
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
