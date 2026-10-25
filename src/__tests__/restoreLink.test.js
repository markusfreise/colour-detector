import { describe, it, expect } from 'vitest'
import qrcode from 'qrcode-generator'
import { restoreCode, readRestoreCode, restoreLink, restoreCodeOf, QR_LEVEL } from '../lib/restoreLink.js'
import { stockPaints } from '../data/paints.js'

const defaults = { mode: 'mix', colours: 20, simplify: 0, details: 5, saturation: 100, ai: false, blockingSplit: null, grid: false }
const own = { id: 'custom-1', vendor: 'Daniel Smith', number: '012', name: 'Quinacridone Gold', hex: '#d08a2a', custom: true }
const paints = [...stockPaints, own]
const twelve = stockPaints.slice(0, 11).map((p) => p.id)

describe('restore link', () => {
  it('brings back the settings that were changed and the chosen paints, own ones with their colour', async () => {
    const settings = { ...defaults, colours: 24, details: 3, grid: 'grey', ai: true, blockingSplit: [40, 60] }
    const palette = { auto: false, paintIds: [...twelve, 'custom-1'], layerAuto: true, layerIds: [], autoOff: ['travelbox'] }
    const read = await readRestoreCode(await restoreCode({ settings, defaults, palette, paints }))
    // The AI and a split set by hand belong to the photo, not to the way of working.
    expect(read.settings).toEqual({ colours: 24, details: 3, grid: 'grey' })
    expect(read.palette.auto).toBe(false)
    expect(read.palette.paints).toEqual([...twelve, ['Daniel Smith', '012', 'Quinacridone Gold', '#d08a2a']])
    expect(read.palette.layerAuto).toBe(true)
    expect(read.palette.autoOff).toEqual(['travelbox'])
  })

  it('keeps Auto as Auto, with the base paints of layer mode chosen by hand', async () => {
    const palette = { auto: true, paintIds: twelve, layerAuto: false, layerIds: twelve.slice(0, 3), autoOff: [] }
    const read = await readRestoreCode(await restoreCode({ settings: { ...defaults, mode: 'layer' }, defaults, palette, paints }))
    expect(read.palette).toMatchObject({ auto: true, paints: null, layerAuto: false, layerPaints: twelve.slice(0, 3), autoOff: [] })
  })

  it('stays small enough for a QR code that scans from paper', async () => {
    const settings = { ...defaults, colours: 24, details: 3, saturation: 140, grid: 'grey' }
    const palette = { auto: false, paintIds: [...twelve, 'custom-1'], layerAuto: true, layerIds: [], autoOff: ['travelbox'] }
    const link = restoreLink('https://watercolourlove.de/', await restoreCode({ settings, defaults, palette, paints }))
    expect(link.length).toBeLessThan(300)
    const qr = qrcode(0, QR_LEVEL)
    qr.addData(link)
    qr.make()
    // Twelve paints, one of them one's own: version 11 or less, 61 modules, about 0.6 mm each at 35 mm.
    expect(qr.getModuleCount()).toBeLessThanOrEqual(61)
  })

  it('finds its code in the address and ignores everything else', async () => {
    expect(restoreLink('https://watercolourlove.de/#old', 'abc')).toBe('https://watercolourlove.de/#restore=abc')
    expect(restoreCodeOf('#restore=abc')).toBe('abc')
    expect(restoreCodeOf('#login=ok')).toBe(null)
    expect(await readRestoreCode('not-a-code')).toBe(null)
  })
})
