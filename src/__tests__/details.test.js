import { describe, it, expect } from 'vitest'
import { boxMask, detailWash } from '../lib/details.js'

describe('boxes', () => {
  it('mark their pixels, a little wider than given, and stay inside the picture', () => {
    const mask = boxMask([[0.5, 0.5, 0.75, 0.75], [0.9, 0.9, 1.2, 1.2]], 20, 20, 0)
    expect(mask[10 * 20 + 10]).toBe(1)
    expect(mask[5 * 20 + 5]).toBe(0)
    expect(mask[19 * 20 + 19]).toBe(1)
    const padded = boxMask([[0.5, 0.5, 0.75, 0.75]], 20, 20, 0.5)
    expect(padded[8 * 20 + 8]).toBe(1)
    expect(boxMask([], 4, 4).some(Boolean)).toBe(false)
  })
})

describe('the final wash', () => {
  // A light picture with a dark line inside the box and the same line outside it.
  const w = 60, h = 40
  const lab = new Float32Array(w * h * 3)
  for (let p = 0; p < w * h; p++) lab[p * 3] = 0.85
  for (let x = 10; x < 25; x++) for (const y of [10, 11]) lab[(y * w + x) * 3] = 0.3
  for (let x = 40; x < 55; x++) for (const y of [30, 31]) lab[(y * w + x) * 3] = 0.3
  lab[(20 * w + 15) * 3] = 0.3 // a speck

  it('takes the dark shapes inside the boxes and nothing else', () => {
    const where = boxMask([[0, 0, 0.5, 0.6]], w, h, 0)
    const wash = detailWash(lab, w, h, where)
    expect(wash.mask[10 * w + 15]).toBe(1)
    expect(wash.mask[30 * w + 45]).toBe(0) // outside the box
    expect(wash.mask[20 * w + 15]).toBe(0) // too small for a stroke
    expect(wash.mask[5 * w + 5]).toBe(0)
    expect(wash.shapes).toBe(1)
    expect(wash.pixels).toBe(30)
    expect(wash.lab[0]).toBeCloseTo(0.3, 5)
  })

  it('finds nothing in an even area', () => {
    const flat = new Float32Array(w * h * 3).fill(0.5)
    const wash = detailWash(flat, w, h, new Uint8Array(w * h).fill(1))
    expect(wash.pixels).toBe(0)
    expect(wash.lab).toBeNull()
  })
})
