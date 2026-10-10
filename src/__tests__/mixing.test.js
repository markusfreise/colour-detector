import { describe, it, expect } from 'vitest'
import { findRecipes, mixHex, toParts, proposePaints, washRecipe, planWashes, washLetter } from '../lib/mixing.js'
import { hexToOklab, deltaE } from '../lib/color.js'
import { stockPaints } from '../data/paints.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }

describe('washes', () => {
  const paints = [yellow, blue, red]
  const byId = Object.fromEntries(paints.map((p) => [p.id, p]))
  const colour = (hex, weight) => ({ hex, weight, recipes: findRecipes(hex, paints, { maxPaints: 2 }) })

  it('dilutes a mix to reach a lighter colour of the same hue', () => {
    const [full] = findRecipes('#2b61ab', [blue])
    const light = mixHex([blue], [0.3])
    const wash = washRecipe(full, light, byId)
    expect(wash.deltaE).toBeLessThan(0.5)
    expect(wash.strength).toBeCloseTo(0.3, 1)
    expect(wash.paints.map((p) => p.paintId)).toEqual(['b'])
  })
  it('lets colours that differ only in strength share one mix', () => {
    const plan = planWashes([colour(mixHex([blue], [1.6]), 5), colour(mixHex([blue], [0.4]), 3), colour(mixHex([red], [1]), 1)], paints)
    expect(plan.map((p) => p.family)).toEqual([0, 0, 2])
    expect(plan[0].wash).toBeNull()
    expect(plan[1].wash.strength).toBeCloseTo(0.4, 1)
  })
  it('keeps a different hue as a mix of its own', () => {
    const plan = planWashes([colour('#2b61ab', 2), colour('#e6331d', 1)], paints)
    expect(plan.map((p) => p.family)).toEqual([0, 1])
  })
  it('names the water level with a letter', () => {
    expect([0.2, 0.5, 1, 2, 3].map(washLetter).join('')).toBe('WLMRC')
  })
})

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
