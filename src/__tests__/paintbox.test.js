import { describe, it, expect } from 'vitest'
import { colourFamily } from '../lib/color.js'
import { paintNumber, groupPaints, sortPaints } from '../lib/paintbox.js'
import { stockPaints } from '../data/paints.js'

describe('colourFamily', () => {
  it('maps paints to their colour-wheel family', () => {
    expect(colourFamily('#fae409')).toBe('yellow') // Aureolin hue
    expect(colourFamily('#ec680f')).toBe('orange') // Transparent orange
    expect(colourFamily('#e6331d')).toBe('red') // Vermilion
    expect(colourFamily('#cf3280')).toBe('red') // Quinacridone magenta (hue wraps around 0)
    expect(colourFamily('#8366aa')).toBe('violet') // Cobalt violet hue
    expect(colourFamily('#243f8f')).toBe('blue') // Ultramarine finest
    expect(colourFamily('#60b236')).toBe('green') // Permanent green
    expect(colourFamily('#706c63')).toBe('neutral') // Ivory black
  })
})

describe('paintNumber', () => {
  it('pads plain numbers to three digits', () => {
    expect(paintNumber('45')).toBe('045')
    expect(paintNumber(7)).toBe('007')
    expect(paintNumber('347')).toBe('347')
  })
  it('keeps prefixed numbers', () => {
    expect(paintNumber('W311')).toBe('W311')
  })
})

const paint = (number, hex, forms) => ({ id: number, number, hex, forms })

describe('sortPaints', () => {
  it('sorts by colour-wheel family, then number', () => {
    const sorted = sortPaints([
      paint('496', '#2b61ab', ['tube 15 ml']),
      paint('365', '#e6331d', ['whole pan']),
      paint('347', '#e2544d', ['half pan']),
      paint('208', '#fae409', ['whole pan']),
    ])
    expect(sorted.map((p) => p.number)).toEqual(['208', '347', '365', '496'])
  })
})

describe('groupPaints', () => {

  it('groups by form first, sorted by family, then number', () => {
    const groups = groupPaints([
      paint('365', '#e6331d', ['whole pan']),
      paint('208', '#fae409', ['whole pan', 'tube 15 ml']),
      paint('347', '#e2544d', ['half pan']),
      paint('496', '#2b61ab', ['tube 15 ml']),
    ])
    expect(groups.map((g) => g.key)).toEqual(['pan', 'tube'])
    expect(groups[0].paints.map((p) => p.number)).toEqual(['208', '347', '365'])
    expect(groups[1].paints.map((p) => p.number)).toEqual(['208', '496'])
  })

  it('places every stock paint in at least one form group', () => {
    const ids = new Set(groupPaints(stockPaints).flatMap((g) => g.paints.map((p) => p.id)))
    expect(ids.size).toBe(stockPaints.length)
  })
})
