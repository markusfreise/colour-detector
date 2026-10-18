import { describe, it, expect } from 'vitest'
import { segmentImage, connectedComponents, varietyWeights, AREA_POWER, LIGHTNESS_WEIGHT } from '../lib/segment.js'
import { hexToOklab } from '../lib/color.js'

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

describe('segment', () => {
  it('splits a two-colour image into two areas', () => {
    const rgba = makeImage(40, 20, (x) => (x < 20 ? [200, 40, 30] : [30, 60, 160]))
    const seg = segmentImage(rgba, 40, 20, { colours: 2, simplify: 0 })
    expect(seg.regions).toHaveLength(2)
    expect(seg.clusters.filter((c) => c.pixelCount).length).toBe(2)
  })
  it('merges speckle noise into the surrounding area', () => {
    const rgba = makeImage(60, 60, (x, y) => ((x * 7 + y * 13) % 97 === 0 ? [255, 255, 255] : [90, 120, 60]))
    const seg = segmentImage(rgba, 60, 60, { colours: 2, simplify: 4 })
    expect(seg.regions.length).toBe(1)
  })
  it('keeps a small colourful part of a mostly dark picture', () => {
    // A dark, nearly neutral gradient with a muted red patch covering 1% of the picture.
    const picture = makeImage(100, 100, (x, y) => {
      if (x >= 45 && x < 55 && y >= 45 && y < 55) return [150, 80, 70]
      const v = 20 + Math.round((x + y) * 0.5)
      return [v + 6, v, v - 6]
    })
    const seg = segmentImage(picture, 100, 100, { colours: 3, simplify: 0 })
    const reds = seg.clusters.filter((c) => c.pixelCount && hexToOklab(c.hex)[1] > 0.05)
    expect(reds).toHaveLength(1)
    // The patch is 100 pixels; its corners are rounded off like every outline.
    expect(reds[0].pixelCount).toBeGreaterThanOrEqual(92)
    expect(reds[0].pixelCount).toBeLessThanOrEqual(100)
  })
  it('paints one hue in several washes instead of several mixes', () => {
    // The same blue from pale to deep, next to a flat red.
    const picture = makeImage(120, 40, (x, y) => {
      if (y >= 30) return [200, 60, 50]
      const t = Math.pow(0.9 - 0.75 * (x / 119), 1 / 2.2)
      return [Math.round(255 * Math.pow(t, 3)), Math.round(255 * Math.pow(t, 1.6)), Math.round(255 * Math.pow(t, 0.5))]
    })
    const used = segmentImage(picture, 120, 40, { colours: 2, simplify: 0 }).clusters.filter((c) => c.pixelCount)
    expect(new Set(used.map((c) => c.group)).size).toBe(2)
    expect(used.length).toBeGreaterThan(3)
    const blues = used.filter((c) => hexToOklab(c.hex)[2] < 0)
    expect(new Set(blues.map((c) => c.group)).size).toBe(1)
    expect(blues.length).toBeGreaterThan(2)
  })
  it('weighs the colours by the Details slider, with the constants at 5', () => {
    expect(varietyWeights(5)).toEqual({ areaPower: AREA_POWER, lightnessWeight: LIGHTNESS_WEIGHT })
    expect(varietyWeights()).toEqual(varietyWeights(5))
    // Low Details: colours by area and lightness; high Details: small colours and hue.
    expect(varietyWeights(0).areaPower).toBeCloseTo(0.8)
    expect(varietyWeights(0).lightnessWeight).toBeCloseTo(1)
    expect(varietyWeights(10).areaPower).toBeCloseTo(0)
    expect(varietyWeights(10).lightnessWeight).toBeCloseTo(0.25)
    expect(varietyWeights(-3)).toEqual(varietyWeights(0))
    expect(varietyWeights(12)).toEqual(varietyWeights(10))
  })

  it('lets Details change the analysis itself, not only the joining of mixes', () => {
    // Many colours: hue across, lightness down, so the weights decide where the mixes go.
    const picture = makeImage(60, 60, (x, y) => [60 + x * 3, 60 + y * 3, 200 - x * 2])
    const colours = (seg) => seg.clusters.filter((c) => c.pixelCount).map((c) => c.hex).join()
    const at = (variety) => colours(segmentImage(picture, 60, 60, { colours: 8, simplify: 0, variety }))
    expect(at(5)).toBe(colours(segmentImage(picture, 60, 60, { colours: 8, simplify: 0 })))
    expect(at(0)).not.toBe(at(10))
  })

  it('labels 4-connected components', () => {
    const labels = Int32Array.from([0, 0, 1, 1, 0, 1, 1, 1, 0])
    const { regionCluster } = connectedComponents(labels, 3, 3)
    expect(regionCluster).toEqual([0, 1, 1, 0])
    expect(regionCluster.length).toBe(4)
  })
})
