import { describe, it, expect } from 'vitest'
import { lightnessOf, histogram, naturalSplit, toneOf, toneOfHex, toneGrey, blockImage, lightnessMap, greyOf, meanLightness, backgroundLightness } from '../lib/blocking.js'

// A test picture: every pixel the grey (or colour) that `at(x, y)` gives.
function picture(width, height, at) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y)
      rgba.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return rgba
}
const grey = (v) => [v, v, v]

describe('blocking: lightness', () => {
  it('is CIE L*, not an average of red, green and blue', () => {
    expect(lightnessOf(255, 255, 255)).toBeCloseTo(100, 3)
    expect(lightnessOf(0, 0, 0)).toBeCloseTo(0, 3)
    expect(lightnessOf(119, 119, 119)).toBeCloseTo(50, 0)
    // Pure yellow looks far lighter than pure blue, though both average to 170.
    expect(lightnessOf(255, 255, 0)).toBeGreaterThan(95)
    expect(lightnessOf(0, 0, 255)).toBeLessThan(35)
  })

  it('counts the pixels per step of L*', () => {
    const hist = histogram(Float32Array.from([0, 49.9, 50, 100]), 2)
    expect([...hist]).toEqual([2, 2])
  })
})

describe('blocking: where the photo divides', () => {
  it('splits two groups of lightness between them', () => {
    const L = Float32Array.from({ length: 1000 }, (_, i) => (i < 600 ? 85 + (i % 5) : 15 + (i % 5)))
    const [t] = naturalSplit(histogram(L), 2)
    expect(t).toBeGreaterThan(19)
    expect(t).toBeLessThanOrEqual(85)
  })

  it('finds three groups for three tones', () => {
    const L = Float32Array.from({ length: 900 }, (_, i) => [90, 50, 10][i % 3])
    const [a, b] = naturalSplit(histogram(L), 3)
    expect(a).toBeGreaterThan(10)
    expect(a).toBeLessThanOrEqual(50)
    expect(b).toBeGreaterThan(50)
    expect(b).toBeLessThanOrEqual(90)
  })

  it('numbers the tones from the lightest', () => {
    expect(toneOf(80, [40])).toBe(0)
    expect(toneOf(20, [40])).toBe(1)
    expect(toneOf(50, [35, 65])).toBe(1)
    expect(toneOf(10, [35, 65])).toBe(2)
    expect(toneOfHex('#ffffff', [35, 65])).toBe(0)
    expect(toneOfHex('#000000', [35, 65])).toBe(2)
  })

  it('shows the tones as paper white down to a strong dark', () => {
    expect(toneGrey(0, 2)).toEqual([255, 255, 255])
    expect(toneGrey(1, 2)[0]).toBeLessThan(70)
    const [light, middle, dark] = [0, 1, 2].map((t) => toneGrey(t, 3)[0])
    expect(light).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(dark)
  })
})

describe('blocking: the grey behind the picture', () => {
  it('averages the lightness of the picture', () => {
    const rgba = picture(100, 100, (x) => grey(x < 50 ? 255 : 0))
    expect(meanLightness(rgba)).toBeCloseTo(50, 0)
    expect(meanLightness(picture(10, 10, () => grey(255)))).toBeCloseTo(100, 3)
  })

  it('lies halfway to white behind a dark picture, halfway to black behind a light one', () => {
    expect(backgroundLightness(20)).toBe(60)
    expect(backgroundLightness(50)).toBe(75)
    expect(backgroundLightness(80)).toBe(40)
  })

  it('turns an L* back into the grey of that lightness', () => {
    expect(greyOf(100)).toEqual([255, 255, 255])
    expect(greyOf(0)).toEqual([0, 0, 0])
    expect(lightnessOf(...greyOf(40))).toBeCloseTo(40, 0)
  })
})

describe('blocking: the masses of a picture', () => {
  it('gives a light and a dark half as two masses', () => {
    const rgba = picture(120, 80, (x) => grey(x < 60 ? 230 : 30))
    const result = blockImage(rgba, 120, 80, { tones: 2 })
    expect(result.regions).toHaveLength(2)
    expect(result.shares[0]).toBeCloseTo(0.5, 1)
    expect(result.toneMap[0]).toBe(0)
    expect(result.toneMap[119]).toBe(1)
  })

  it('leaves texture out: specks in a light field join it', () => {
    // A light field with dark single pixels every few pixels, and one large dark block.
    const rgba = picture(200, 140, (x, y) => (x > 140 && y > 80 ? grey(20) : (x * 7 + y * 13) % 23 === 0 ? grey(25) : grey(225)))
    const result = blockImage(rgba, 200, 140, { tones: 2, forms: 6 })
    expect(result.regions.length).toBeLessThanOrEqual(3)
    expect(result.toneMap[10 * 200 + 10]).toBe(0)
    expect(result.toneMap[120 * 200 + 180]).toBe(1)
  })

  it('keeps more of the small shapes at Forms 0', () => {
    const rgba = picture(200, 140, (x, y) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? grey(220) : grey(40)))
    const fine = blockImage(rgba, 200, 140, { tones: 2, forms: 0 }).regions.length
    const large = blockImage(rgba, 200, 140, { tones: 2, forms: 10 }).regions.length
    expect(fine).toBeGreaterThan(large)
  })

  it('puts three bands in three tones, in order from light to dark', () => {
    const rgba = picture(90, 60, (x) => grey(x < 30 ? 235 : x < 60 ? 120 : 25))
    const result = blockImage(rgba, 90, 60, { tones: 3 })
    expect(result.thresholds).toHaveLength(2)
    expect([result.toneMap[5], result.toneMap[45], result.toneMap[85]]).toEqual([0, 1, 2])
  })

  it('takes a split given by hand, and gives the same masses every time', () => {
    const rgba = picture(100, 60, (x) => grey(Math.round((x / 99) * 255)))
    const a = blockImage(rgba, 100, 60, { tones: 2, split: [30] })
    const b = blockImage(rgba, 100, 60, { tones: 2, split: [70] })
    expect(a.thresholds).toEqual([30])
    expect(a.shares[0]).toBeGreaterThan(b.shares[0])
    expect([...blockImage(rgba, 100, 60, { tones: 2, split: [30] }).toneMap]).toEqual([...a.toneMap])
    // A split that does not fit the number of tones is left for the natural one.
    expect(blockImage(rgba, 100, 60, { tones: 3, split: [30] }).thresholds).toHaveLength(2)
  })

  it('measures colour by what the eye sees: a yellow field is light, a blue one dark', () => {
    const rgba = picture(80, 40, (x) => (x < 40 ? [250, 220, 40] : [30, 40, 160]))
    const result = blockImage(rgba, 80, 40, { tones: 2 })
    expect(result.toneMap[5]).toBe(0)
    expect(result.toneMap[75]).toBe(1)
    expect(lightnessMap(rgba, 80 * 40)[5]).toBeGreaterThan(80)
  })
})
