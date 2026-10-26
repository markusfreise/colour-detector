import { describe, expect, it } from 'vitest'
import { debugWanted } from '../lib/debug.js'

function memory() {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) }
}

describe('debugWanted', () => {
  it('shows the menu on development hosts', () => {
    expect(debugWanted({ hostname: 'localhost', search: '' })).toBe(true)
    expect(debugWanted({ hostname: 'colour-detector.test', search: '' })).toBe(true)
    expect(debugWanted({ hostname: 'watercolourlove.croeso.de', search: '' })).toBe(true)
    // The dev server opened from a phone in the same network.
    expect(debugWanted({ hostname: '192.168.1.24', search: '' })).toBe(true)
    expect(debugWanted({ hostname: '10.0.0.5', search: '' })).toBe(true)
    expect(debugWanted({ hostname: 'markus-mac.local', search: '' })).toBe(true)
  })

  it('hides it on public hosts', () => {
    expect(debugWanted({ hostname: 'markus-freise.de', search: '' })).toBe(false)
    expect(debugWanted({ hostname: 'watercolourlove.markus-freise.de', search: '' }, memory())).toBe(false)
    expect(debugWanted({ hostname: 'notcroeso.de', search: '' })).toBe(false)
    expect(debugWanted({ hostname: '172.32.0.1', search: '' })).toBe(false)
    expect(debugWanted({ hostname: '8.8.8.8', search: '' })).toBe(false)
  })

  it('shows it for the session once the address carried ?debug', () => {
    const storage = memory()
    expect(debugWanted({ hostname: 'markus-freise.de', search: '?debug' }, storage)).toBe(true)
    expect(debugWanted({ hostname: 'markus-freise.de', search: '' }, storage)).toBe(true)
  })
})
