import { describe, it, expect } from 'vitest'
import { icons } from '../components/icons.js'

describe('icons', () => {
  it('reads every file in resources/icons as paths, named in lower case with hyphens', () => {
    const names = Object.keys(icons)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9-]+$/)
      expect(icons[name].length).toBeGreaterThan(0)
      for (const d of icons[name]) expect(d).toMatch(/^M /)
    }
    expect(icons.brush).toBeDefined()
    expect(icons.camera).toBeDefined()
  })
})
