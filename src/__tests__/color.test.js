import { describe, it, expect } from 'vitest'
import { hexToRgb, rgbToHex, hexToOklab, oklabToHex, deltaE } from '../lib/color.js'

describe('color', () => {
  it('round-trips hex <-> rgb', () => {
    expect(hexToRgb('#1a2b3c')).toEqual([26, 43, 60])
    expect(rgbToHex([26, 43, 60])).toBe('#1a2b3c')
  })
  it('round-trips hex <-> oklab', () => {
    for (const hex of ['#ffffff', '#000000', '#e6331d', '#243f8f', '#7d6441']) {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex)
    }
  })
  it('measures white vs black as ~100', () => {
    expect(deltaE(hexToOklab('#ffffff'), hexToOklab('#000000'))).toBeCloseTo(100, 0)
  })
})
