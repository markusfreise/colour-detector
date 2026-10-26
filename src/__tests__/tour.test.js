import { describe, it, expect } from 'vitest'
import { placeCard, unionRect } from '../lib/tour.js'

const view = { width: 1440, height: 900 }
const card = { width: 320, height: 160 }

describe('guided tour', () => {
  it('puts the card beside a button on the left, level with it', () => {
    const place = placeCard({ left: 20, top: 40, width: 48, height: 100 }, card, view)
    expect(place).toEqual({ left: 80, top: 16, side: 'right' })
  })

  it('goes to the left of a button at the right edge', () => {
    expect(placeCard({ left: 1380, top: 400, width: 48, height: 48 }, card, view).side).toBe('left')
  })

  it('goes below or above where neither side has room, and stays inside the window', () => {
    const phone = { width: 390, height: 844 }
    const top = placeCard({ left: 140, top: 20, width: 110, height: 48 }, card, phone)
    expect(top).toMatchObject({ side: 'below', top: 80 })
    expect(top.left).toBeGreaterThanOrEqual(16)
    expect(top.left + card.width).toBeLessThanOrEqual(phone.width - 16)
    expect(placeCard({ left: 20, top: 780, width: 350, height: 48 }, card, phone).side).toBe('above')
  })

  it('lies over a target that fills the window, at its foot', () => {
    expect(placeCard({ left: 0, top: 0, width: 390, height: 844 }, card, { width: 390, height: 844 })).toMatchObject({ side: 'over', top: 844 - 16 - 160 })
  })

  it('outlines several buttons as one, and nothing that is folded away', () => {
    expect(unionRect([{ left: 10, top: 10, width: 40, height: 40 }, { left: 10, top: 60, width: 40, height: 40 }])).toEqual({ left: 10, top: 10, width: 40, height: 90 })
    expect(unionRect([{ left: 0, top: 0, width: 0, height: 0 }])).toBe(null)
  })
})
