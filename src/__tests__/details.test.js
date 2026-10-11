import { describe, it, expect } from 'vitest'
import { boxMask, detailWash, edgeSketch } from '../lib/details.js'

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

describe('the sketch', () => {
  // A dark square on light paper, with a soft gradient beside it.
  const w = 120, h = 80
  const lab = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = x >= 20 && x < 50 && y >= 20 && y < 60
      lab[(y * w + x) * 3] = inside ? 0.3 : x > 70 ? 0.9 - (x - 70) * 0.002 : 0.9
    }
  }

  it('draws the edge of a shape and nothing in even or softly graded areas', () => {
    const lines = edgeSketch(lab, w, h)
    const near = (x, y) => [-2, -1, 0, 1, 2].some((d) => lines[y * w + x + d] || lines[(y + d) * w + x])
    expect(near(20, 40)).toBe(true)
    expect(near(35, 20)).toBe(true)
    expect(lines[40 * w + 35]).toBe(0) // inside the square
    expect(lines[40 * w + 95]).toBe(0) // in the gradient
    expect(lines[5 * w + 5]).toBe(0)
  })

  it('makes lines firm inside the main subjects and light or absent outside', () => {
    const subject = boxMask([[0.1, 0.2, 0.45, 0.8]], w, h, 0)
    const lines = edgeSketch(lab, w, h, subject)
    expect([...lines].filter((v) => v === 2).length).toBeGreaterThan(50)
    const elsewhere = edgeSketch(lab, w, h, boxMask([[0.7, 0, 1, 1]], w, h, 0))
    expect([...elsewhere].filter((v) => v === 2)).toHaveLength(0)
  })
})
