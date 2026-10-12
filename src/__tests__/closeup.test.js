import { describe, it, expect } from 'vitest'
import { closeupRect, closeupSize, MAX_ENLARGE } from '../lib/closeup.js'

describe('closeupRect', () => {
  it('is the same whichever corner the drag starts from', () => {
    const rect = closeupRect({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 })
    expect(rect.x).toBeCloseTo(0.2)
    expect(rect.y).toBeCloseTo(0.3)
    expect(rect.w).toBeCloseTo(0.4)
    expect(rect.h).toBeCloseTo(0.4)
  })

  it('stays inside the picture', () => {
    const rect = closeupRect({ x: -0.3, y: 0.5 }, { x: 0.5, y: 1.4 })
    expect(rect).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 })
  })

  it('takes a short drag for a slip', () => {
    expect(closeupRect({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.9 })).toBeNull()
    expect(closeupRect({ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.51 })).toBeNull()
  })
})

describe('closeupSize', () => {
  const work = 800 * 600

  it('shrinks a large part to the working size and keeps its shape', () => {
    const size = closeupSize(4000, 3000, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, work)
    expect(size).toMatchObject({ sx: 1000, sy: 750, sw: 2000, sh: 1500 })
    expect(size.width * size.height).toBeLessThanOrEqual(work * 1.01)
    expect(size.width / size.height).toBeCloseTo(2000 / 1500, 2)
  })

  it('enlarges a small part, but not beyond the limit', () => {
    const size = closeupSize(800, 600, { x: 0, y: 0, w: 0.1, h: 0.1 }, work)
    expect(size.width).toBe(80 * MAX_ENLARGE)
    expect(size.height).toBe(60 * MAX_ENLARGE)
  })

  it('never reaches past the edge of the source', () => {
    const size = closeupSize(101, 51, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, work)
    expect(size.sx + size.sw).toBeLessThanOrEqual(101)
    expect(size.sy + size.sh).toBeLessThanOrEqual(51)
  })
})
