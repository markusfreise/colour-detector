import { describe, it, expect } from 'vitest'
import { findRecipes, mixHex, toParts, proposePaints } from '../lib/mixing.js'
import { hexToOklab, deltaE } from '../lib/color.js'
import { stockPaints } from '../data/paints.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }

describe('mixing', () => {
  it('mixing a paint with itself at amount 1 gives the paint', () => {
    expect(deltaE(hexToOklab(mixHex([yellow], [1])), hexToOklab('#fae409'))).toBeLessThan(0.5)
  })
  it('yellow + blue gives a green (subtractive, not grey)', () => {
    const [L, a] = hexToOklab(mixHex([yellow, blue], [1, 1]))
    expect(a).toBeLessThan(-0.05) // negative a = green
    expect(L).toBeGreaterThan(0.3)
  })
  it('finds the exact paint when the target is a stock colour', () => {
    const [best] = findRecipes('#e6331d', [yellow, blue, red], { maxPaints: 2 })
    expect(best.paints.map((p) => p.paintId)).toEqual(['r'])
    expect(best.deltaE).toBeLessThan(0.5)
  })
  it('returns paper for white targets', () => {
    const [best] = findRecipes('#ffffff', [yellow, blue, red])
    expect(best.paints).toEqual([])
  })
  it('respects maxPaints', () => {
    const recipes = findRecipes('#6a7a5a', stockPaints, { maxPaints: 2 })
    recipes.forEach((r) => expect(r.paints.length).toBeLessThanOrEqual(2))
  })
  it('matches landscape colours from the stock reasonably', () => {
    for (const target of ['#8a7a52', '#5f6b7d', '#a9b4c2', '#4a4a3a']) {
      const [best] = findRecipes(target, stockPaints)
      expect(best.deltaE).toBeLessThan(6)
      // reported ΔE is computed before rounding the predicted colour to 8-bit hex
      expect(Math.abs(deltaE(hexToOklab(best.hex), hexToOklab(target)) - best.deltaE)).toBeLessThan(0.5)
    }
  })
  it('expresses amounts as simple parts', () => {
    expect(toParts([0.9, 0.3])).toEqual([3, 1])
  })
  it('proposes the paints a picture needs and reuses them', () => {
    const targets = [
      { hex: '#e6331d', weight: 0.6 },
      { hex: '#e6331d', weight: 0.3 },
      { hex: '#fae409', weight: 0.1 },
    ]
    expect(proposePaints(targets, [yellow, blue, red]).sort()).toEqual(['r', 'y'])
  })
  it('proposes nothing for a white picture', () => {
    expect(proposePaints([{ hex: '#ffffff', weight: 1 }], [yellow, blue, red])).toEqual([])
  })
})
