import { describe, it, expect } from 'vitest'
import { colourFamily } from '../lib/color.js'
import { paintNumber, paintForms, groupPaints, sortPaints, paintGroupKeys, seriesNames, HOUSE_VENDOR } from '../lib/paintbox.js'
import { stockPaints } from '../data/paints.js'
import { PAINT_LIBRARIES, libraryByName } from '../data/libraries.js'

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

const paint = (number, hex, forms, vendor = HOUSE_VENDOR) => ({ id: number, number, hex, forms, vendor })

describe('paintForms', () => {
  it('labels pans, tubes and both', () => {
    expect(paintForms(paint('1', '#fff', ['half pan']))).toBe('P')
    expect(paintForms(paint('1', '#fff', ['tube 15 ml']))).toBe('T')
    expect(paintForms(paint('A1', '#fff', ['travelbox']))).toBe('S')
    expect(paintForms(paint('1', '#fff', ['whole pan', 'tube 15 ml', 'tube 15 ml']))).toBe('P/T')
  })
})

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

  it('lists the travel box last, in the order of its places', () => {
    const groups = groupPaints([
      paint('B2', '#2b61ab', ['travelbox']),
      paint('A10', '#e6331d', ['travelbox']),
      paint('A2', '#fae409', ['travelbox']),
      paint('347', '#e2544d', ['half pan']),
    ])
    expect(groups.map((g) => g.name)).toEqual([`${HOUSE_VENDOR} Pans`, 'Travelbox'])
    expect(groups[1].paints.map((p) => p.number)).toEqual(['A2', 'A10', 'B2'])
  })

  it('gives every other brand a group of its own, after the travel box', () => {
    const groups = groupPaints([
      paint('W311', '#c88c5f', ['tube 15 ml'], 'Michael Harding'),
      paint('A2', '#fae409', ['travelbox'], 'Travelbox'),
      paint('496', '#2b61ab', ['tube 15 ml']),
      paint('12', '#e6331d', ['pan'], 'Daniel Smith'),
    ])
    expect(groups.map((g) => g.name)).toEqual([`${HOUSE_VENDOR} Tubes`, 'Travelbox', 'Daniel Smith', 'Michael Harding'])
    expect(groups[0].paints.map((p) => p.number)).toEqual(['496'])
  })

  it('keeps a group whose paints are all hidden, and names the groups of a paint', () => {
    const all = [paint('347', '#e2544d', ['half pan']), paint('496', '#2b61ab', ['tube 15 ml'])]
    const groups = groupPaints(all, (p) => p.number !== '347')
    expect(groups.map((g) => [g.key, g.paints.length])).toEqual([['pan', 0], ['tube', 1]])
    expect(paintGroupKeys(paint('208', '#fae409', ['whole pan', 'tube 15 ml']))).toEqual(['pan', 'tube'])
    expect(paintGroupKeys(paint('A2', '#fae409', ['travelbox'], 'Travelbox'))).toEqual(['travelbox'])
    expect(paintGroupKeys(paint('W311', '#c88c5f', ['tube 15 ml'], 'Michael Harding'))).toEqual(['vendor:Michael Harding'])
  })

  it('places every stock paint in at least one form group', () => {
    const ids = new Set(groupPaints(stockPaints).flatMap((g) => g.paints.map((p) => p.id)))
    expect(ids.size).toBe(stockPaints.length)
  })
})

describe('paint libraries', () => {
  it('ships Schmincke Horadam as the series of the stock', () => {
    const horadam = libraryByName(HOUSE_VENDOR)
    expect(horadam).toBe(PAINT_LIBRARIES[0])
    expect(horadam.catalogue.find((c) => c.number === '347').name).toBe('Kadmiumrot mittel')
    // However it is written in the form.
    expect(libraryByName('  schmincke horadam ')).toBe(horadam)
    expect(libraryByName('Michael Harding')).toBe(null)
    expect(libraryByName(undefined)).toBe(null)
  })

  it('ships Winsor & Newton Professional with its chart', () => {
    const wn = libraryByName('winsor & newton professional')
    expect(wn.catalogue).toHaveLength(116)
    expect(new Set(wn.catalogue.map((c) => c.number)).size).toBe(116)
    expect(wn.catalogue.every((c) => /^\d{3}$/.test(c.number) && /^#[0-9a-f]{6}$/.test(c.hex) && c.name)).toBe(true)
    expect(wn.catalogue.find((c) => c.number === '263').name).toBe('French Ultramarine')
  })

  it('offers the series in use and those of the libraries, for the autocomplete', () => {
    const names = seriesNames(
      [paint('W311', '#c88c5f', ['tube 15 ml'], 'Michael Harding'), paint('347', '#e2544d', ['half pan'])],
      PAINT_LIBRARIES,
    )
    expect(names).toEqual(['Michael Harding', HOUSE_VENDOR, 'Winsor & Newton Professional'])
    expect(seriesNames(stockPaints, PAINT_LIBRARIES)).toContain('Travelbox')
  })
})
