import { describe, it, expect } from 'vitest'
import { planMixes, mixesToRequest } from '../lib/mixes.js'
import { mixHex } from '../lib/mixing.js'

const yellow = { id: 'y', hex: '#fae409' }
const blue = { id: 'b', hex: '#2b61ab' }
const red = { id: 'r', hex: '#e6331d' }
const paints = [yellow, blue, red]
const cluster = (index, group, hex, pixelCount) => ({ index, group, hex, pixelCount })

describe('mixes', () => {
  // Two blues that differ only in strength, found as separate mixes, and a small red.
  const clusters = [
    cluster(0, 0, mixHex([blue], [1.4]), 6000),
    cluster(1, 1, mixHex([blue], [0.4]), 3000),
    cluster(2, 2, mixHex([red], [1]), 100),
  ]

  it('joins mixes that are washes of each other before it gives up a hue', () => {
    const mixes = planMixes(clusters, paints, { wanted: 2, variety: 10 })
    expect(mixes).toHaveLength(2)
    const blues = mixes.find((m) => m.clusters.length === 2)
    expect(blues.clusters.map((c) => c.index).sort()).toEqual([0, 1])
    expect(blues.recipes[0].paints.map((p) => p.paintId)).toEqual(['b'])
  })
  it('keeps every mix when there are no more than wanted', () => {
    expect(planMixes(clusters, paints, { wanted: 5 })).toHaveLength(2) // the two blues are the same recipe
    expect(planMixes([clusters[0], clusters[2]], paints, { wanted: 5 })).toHaveLength(2)
  })
  it('never ends up with more mixes than wanted', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      cluster(i, i, mixHex([yellow, blue, red], [0.2 + (i % 3) * 0.5, 0.2 + (i % 4) * 0.4, 0.2 + (i % 5) * 0.3]), 100 + i * 50),
    )
    for (const variety of [0, 5, 10]) expect(planMixes(many, paints, { wanted: 4, variety }).length).toBeLessThanOrEqual(4)
  })
  it('asks the analysis for spare mixes', () => {
    expect(mixesToRequest(5)).toBeGreaterThan(5)
    expect(mixesToRequest(32)).toBeLessThanOrEqual(48)
  })
})
