import { describe, it, expect } from 'vitest'
import { layerImage, fitLayers, proposeLayerPaints, colourSet, renderLayers, compositeColours } from '../lib/layers.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }

function image(width, height, fn) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    const [r, g, b] = fn(p % width, Math.floor(p / width))
    rgba.set([r, g, b, 255], p * 4)
  }
  return rgba
}

// What the worker hands over: every buffer once, and the whole result survives the copy.
function transfer(result) {
  const buffers = [result.comboMap.buffer, ...result.layers.flatMap((l) => [l.coatMap.buffer, l.regionMap.buffer])]
  expect(new Set(buffers).size).toBe(buffers.length)
  return structuredClone(result, { transfer: buffers })
}

function consistent(result, pixels) {
  expect(result.comboMap.length).toBe(pixels)
  for (const c of result.comboMap) expect(c).toBeLessThan(result.combos.length)
  expect(result.combos.reduce((n, c) => n + c.pixelCount, 0)).toBe(pixels)
  for (const layer of result.layers) {
    expect(layer.coatMap.length).toBe(pixels)
    expect(layer.coats.length).toBe(result.maxCoats)
    expect(Math.max(...layer.coatMap)).toBeLessThanOrEqual(result.maxCoats)
    for (const region of layer.regions) {
      expect(region.anchorX).toBeGreaterThanOrEqual(0)
      expect(region.anchorX).toBeLessThan(result.width)
      expect(region.anchorY).toBeLessThan(result.height)
    }
  }
  for (const step of result.steps) expect(step.share).toBeGreaterThan(0)
  for (const v of Object.values(result.deltaE)) expect(Number.isFinite(v)).toBe(true)
  expect(renderLayers(result).length).toBe(pixels * 4)
}

describe('layers of a picture, edge cases', () => {
  it('handles a picture of one pixel', () => {
    const result = layerImage(image(1, 1, () => [40, 90, 160]), 1, 1, [yellow, blue], { paintIds: ['y', 'b'], simplify: 4 })
    consistent(result, 1)
    transfer(result)
  })

  it('leaves an all-white picture unpainted: layers without coats and no steps', () => {
    const result = layerImage(image(12, 8, () => [255, 255, 255]), 12, 8, [yellow, blue], { paintIds: ['y', 'b'] })
    consistent(result, 96)
    expect(result.steps).toEqual([])
    expect(result.combos).toHaveLength(1)
    expect(result.combos[0].hex).toBe('#ffffff')
    for (const layer of result.layers) expect(layer.coats.every((c) => c.share === 0)).toBe(true)
  })

  it('works with a single paint and a single coat', () => {
    const result = layerImage(image(16, 8, (x) => (x < 8 ? [255, 255, 255] : [60, 110, 180])), 16, 8, [blue], { paintIds: ['b'], maxCoats: 1, simplify: 0 })
    consistent(result, 128)
    expect(result.layers).toHaveLength(1)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({ layer: 0, coat: 1, paintId: 'b' })
  })

  it('skips base paints that are not in the pool', () => {
    const result = layerImage(image(8, 8, () => [60, 110, 180]), 8, 8, [blue], { paintIds: ['gone', 'b'] })
    expect(result.paintIds).toEqual(['b'])
    consistent(result, 64)
  })

  it('gives white paper when none of the base paints exists', () => {
    const result = layerImage(image(8, 8, () => [60, 110, 180]), 8, 8, [blue], { paintIds: ['gone'] })
    expect(result.layers).toEqual([])
    expect(result.paintIds).toEqual([])
    expect(result.steps).toEqual([])
    consistent(result, 64)
    expect(Array.from(renderLayers(result).slice(0, 4))).toEqual([255, 255, 255, 255])
    transfer(result)
  })

  it('proposes no more paints than the pool has, whatever count asks for', () => {
    const pool = [yellow, blue, red]
    const result = layerImage(image(16, 8, (x, y) => [x * 15, 120, y * 30]), 16, 8, pool, { count: 9, maxCoats: 1 })
    expect(result.paintIds.length).toBeLessThanOrEqual(3)
    expect(new Set(result.paintIds).size).toBe(result.paintIds.length)
    consistent(result, 128)
  })

  it('keeps its typed arrays through the transfer out of the worker', () => {
    const result = transfer(layerImage(image(16, 8, (x) => (x < 8 ? [250, 228, 20] : [60, 110, 180])), 16, 8, [yellow, blue], { paintIds: ['y', 'b'] }))
    consistent(result, 128)
    expect(result.layers[0].filters).toBeInstanceOf(Float64Array)
  })
})

describe('fitting, edge cases', () => {
  it('returns empty results for no colours or no paints', () => {
    const none = colourSet([])
    expect(proposeLayerPaints(none, [blue])).toEqual([])
    expect(fitLayers(none, [blue])).toMatchObject({ coats: [], hexes: [], deltaE: [], error: 0 })
    const fit = fitLayers(colourSet([{ hex: '#336699' }]), [])
    expect(fit.layers).toEqual([])
    expect(fit.coats).toEqual([[]])
    expect(fit.hexes).toEqual(['#ffffff'])
  })

  it('shows part of the coats of a layer and ignores missing entries of `enabled`', () => {
    const fit = fitLayers(colourSet([{ hex: '#2b61ab' }]), [blue], { maxCoats: 3 })
    const combos = [{ coats: [3] }]
    const all = compositeColours(fit.layers, combos, [true])
    const one = compositeColours(fit.layers, combos, [1])
    const none = compositeColours(fit.layers, combos, [])
    expect(Array.from(none)).toEqual([255, 255, 255])
    expect(one[0]).toBeGreaterThan(all[0])
    expect(Array.from(compositeColours(fit.layers, combos, [9]))).toEqual(Array.from(all))
  })
})
