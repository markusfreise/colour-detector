import { describe, it, expect } from 'vitest'
import { colourFamily, hueGroup, HUE_GROUPS } from '../lib/color.js'
import { paintNumber, paintForms, groupPaints, sortPaints, paintGroupKeys, seriesNames, seriesColours, filterColours, ownForm, formName, HOUSE_VENDOR } from '../lib/paintbox.js'
import { stockPaints } from '../data/paints.js'
import { readFileSync } from 'node:fs'
import { librariesReport } from '../lib/librariesReport.js'
import { PAINT_LIBRARIES, COMMON_LIBRARY, TRANSPARENCY, chartColour, chartDetails, chartNames, libraryByName, libraryOpen, resolveCommon } from '../data/libraries.js'
import { commonColours } from '../data/common-catalogue.js'

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
    expect(horadam.id).toBe('horadam')
    expect(horadam.catalogue.find((c) => c.number === '347').name).toBe('Kadmiumrot mittel')
    // However it is written in the form.
    expect(libraryByName('  schmincke horadam ')).toBe(horadam)
    expect(libraryByName('My own series')).toBe(null)
    expect(libraryByName(undefined)).toBe(null)
  })

  it('ships Winsor & Newton Professional with its chart', () => {
    const wn = libraryByName('winsor & newton professional')
    expect(wn.catalogue).toHaveLength(116)
    expect(new Set(wn.catalogue.map((c) => c.number)).size).toBe(116)
    expect(wn.catalogue.every((c) => /^\d{3}$/.test(c.number) && /^#[0-9a-f]{6}$/.test(c.hex) && c.name)).toBe(true)
    expect(wn.catalogue.find((c) => c.number === '263').name).toBe('French Ultramarine')
  })

  it('ships Michael Harding with its range, under the name the stock uses', () => {
    const mh = libraryByName('Michael Harding')
    expect(mh.catalogue).toHaveLength(136)
    expect(new Set(mh.catalogue.map((c) => c.number)).size).toBe(136)
    expect(mh.catalogue.every((c) => /^W\d{3}$/.test(c.number) && /^#[0-9a-f]{6}$/.test(c.hex) && c.name)).toBe(true)
    expect(mh.catalogue.find((c) => c.number === 'W311').name).toBe('Quinacridone Bronze')
  })

  it('lists the sources and the unverified colours in docs/libraries.md (npm run libraries)', () => {
    expect(readFileSync(new URL('../../docs/libraries.md', import.meta.url), 'utf8')).toBe(librariesReport(PAINT_LIBRARIES))
    for (const library of PAINT_LIBRARIES) expect(library.source, library.id).toBeTruthy()
  })

  it('keeps every chart in the same shape: unique numbers, a colour or a reason why not, pigments by Colour Index', () => {
    expect(new Set(PAINT_LIBRARIES.map((l) => l.id)).size).toBe(PAINT_LIBRARIES.length)
    for (const library of PAINT_LIBRARIES) {
      const numbers = library.catalogue.map((c) => c.number.toLowerCase())
      expect(new Set(numbers).size, library.id).toBe(numbers.length)
      for (const c of library.catalogue) {
        expect(c.name, `${library.id} ${c.number}`).toBeTruthy()
        if (c.hex === null) expect(c.unverified, `${library.id} ${c.number}`).toBeTruthy()
        else expect(c.hex, `${library.id} ${c.number}`).toMatch(/^#[0-9a-f]{6}$/)
        for (const p of c.pigments ?? []) expect(p, `${library.id} ${c.number}`).toMatch(/^P(Y|O|R|V|B|G|Br|Bk|W|M)\d+(:\d+)?$/)
        if (c.transparency !== undefined) expect(Object.keys(TRANSPARENCY), `${library.id} ${c.number}`).toContain(c.transparency)
      }
    }
  })

  it('ships the common colours for everybody, each with the value of a maker\'s chart', () => {
    expect(PAINT_LIBRARIES[0]).toBe(COMMON_LIBRARY)
    expect(COMMON_LIBRARY.catalogue).toHaveLength(commonColours.length)
    for (const c of commonColours) {
      const [id, ref] = c.from
      const shown = chartColour(PAINT_LIBRARIES.find((l) => l.id === id), ref)
      expect(chartColour(COMMON_LIBRARY, c.number), c.number).toMatchObject({ name: c.name, names: { de: c.de }, hex: shown.hex, pigments: c.pigments })
    }
    // By its English or its German name.
    expect(libraryByName('common colours')).toBe(COMMON_LIBRARY)
    expect(libraryByName(' Gängige Farben ')).toBe(COMMON_LIBRARY)
    expect(() => resolveCommon([{ number: 'X', name: 'Nothing', de: '', pigments: [], from: ['sennelier', '999'] }], PAINT_LIBRARIES)).toThrow(/no colour 999/)
  })

  it('opens the common colours without a plan, the makers\' charts only with one', () => {
    expect(libraryOpen(COMMON_LIBRARY, false)).toBe(true)
    for (const library of PAINT_LIBRARIES.filter((l) => l !== COMMON_LIBRARY)) {
      expect(libraryOpen(library, false), library.id).toBe(false)
      expect(libraryOpen(library, true), library.id).toBe(true)
    }
    expect(libraryOpen(null, true)).toBe(false)
  })

  it('ships Sennelier L\'Aquarelle with pigments, transparency and French names from its chart', () => {
    const sennelier = libraryByName("sennelier l'aquarelle")
    expect(sennelier.catalogue).toHaveLength(98)
    expect(sennelier.catalogue.every((c) => /^\d{3}$/.test(c.number))).toBe(true)
    const ultramarine = chartColour(sennelier, ' 314 ')
    expect(ultramarine).toMatchObject({ name: 'French Ultramarine Blue', pigments: ['PB29', 'PV15'], transparency: 'T' })
    expect(chartNames(ultramarine)).toEqual(['French Ultramarine Blue', 'Bleu Outremer Français'])
    expect(chartDetails(ultramarine)).toEqual(['PB29 PV15', 'Transparent'])
    // The granulating list of 2022 overrules the chart of 2012.
    expect(chartColour(sennelier, '755').transparency).toBe('O')
    // Unverified: the name is known, the colour is not.
    const dioxazine = chartColour(sennelier, '917')
    expect(dioxazine.hex).toBe(null)
    expect(dioxazine.unverified).toMatch(/hue/)
    expect(chartColour(sennelier, '999')).toBe(null)
    expect(chartColour(null, '314')).toBe(null)
  })

  it('offers the series in use and those of the libraries, for the autocomplete', () => {
    const names = seriesNames(
      [paint('W311', '#c88c5f', ['tube 15 ml'], 'Michael Harding'), paint('347', '#e2544d', ['half pan'])],
      PAINT_LIBRARIES,
    )
    expect(names).toEqual(['Common colours', 'Michael Harding', HOUSE_VENDOR, "Sennelier L'Aquarelle", 'Winsor & Newton Professional'])
    expect(new Set(names).size).toBe(names.length)
    expect(seriesNames(stockPaints, PAINT_LIBRARIES)).toContain('Travelbox')
  })
})

describe('hueGroup', () => {
  it('sorts paints into the filters of the add dialog', () => {
    expect(hueGroup('#e73e46')).toBe('red') // Scarlet
    expect(hueGroup('#ef89a6')).toBe('red') // Madder rose
    expect(hueGroup('#ec680f')).toBe('orange')
    expect(hueGroup('#f3d104')).toBe('yellow')
    expect(hueGroup('#60b236')).toBe('green')
    expect(hueGroup('#00c9c9')).toBe('turquoise')
    expect(hueGroup('#3280c2')).toBe('blue')
    expect(hueGroup('#852677')).toBe('violet')
    expect(hueGroup('#95503a')).toBe('brown') // Mahogany
    expect(hueGroup('#7d6441')).toBe('brown') // Vandyke brown
    expect(hueGroup('#706c63')).toBe('grey') // Ivory black
  })

  it('puts the swatch of every filter into its own group', () => {
    for (const group of HUE_GROUPS) expect(hueGroup(group.hex)).toBe(group.key)
  })
})

describe('forms of own paints', () => {
  it('knows liquid and other besides pan and tube', () => {
    expect(ownForm('liquid')).toBe('liquid')
    expect(ownForm('stick')).toBe('pan')
    expect(paintForms({ forms: ['liquid'] })).toBe('L')
    expect(formName({ forms: ['other'] })).toBe('Other')
    expect(formName({ forms: [] })).toBe('Pan')
  })
})

describe('seriesColours', () => {
  const catalogue = [
    { number: '1', name: 'Red', names: { de: 'Rot' }, hex: '#cc2222', pigments: ['PR254'] },
    { number: '2', name: 'Grey', hex: null },
  ]
  const paints = [
    { id: 'a', vendor: 'acme', number: '1', name: 'Own red', hex: '#aa0000' },
    { id: 'b', vendor: 'Acme', number: '9', name: 'Mud', hex: '#665544' },
    { id: 'c', vendor: 'Other', number: '1', name: 'Blue', hex: '#0000ff' },
  ]

  it('sorts by number, prefixed numbers too', () => {
    const chart = ['W201', '12', 'W17', '3'].map((number) => ({ number, name: number, hex: '#000000' }))
    expect(seriesColours('Acme', chart, []).map((c) => c.number)).toEqual(['3', '12', 'W17', 'W201'])
  })

  it('lists the chart, with the known paints in place of their numbers, and the paints off the chart', () => {
    const colours = seriesColours('Acme', catalogue, paints)
    expect(colours.map((c) => [c.number, c.paintId, c.hex])).toEqual([
      ['1', 'a', '#aa0000'],
      ['2', null, null],
      ['9', 'b', '#665544'],
    ])
  })

  it('names chart colours in the language shown', () => {
    expect(seriesColours('Acme', catalogue, [], undefined, 'de')[0].name).toBe('Rot')
  })

  it('lists only the known paints without the chart', () => {
    expect(seriesColours('Acme', [], paints).map((c) => c.paintId)).toEqual(['a', 'b'])
  })

  it('filters by words and by hue', () => {
    const colours = seriesColours('Acme', catalogue, [])
    expect(filterColours(colours, 'pr254').map((c) => c.number)).toEqual(['1'])
    expect(filterColours(colours, 'acme rot').map((c) => c.number)).toEqual(['1'])
    expect(filterColours(colours, '', 'red').map((c) => c.number)).toEqual(['1'])
    expect(filterColours(colours, '', 'blue')).toEqual([])
    expect(filterColours(colours)).toHaveLength(2)
  })
})
