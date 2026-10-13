import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePaintsStore } from '../stores/paints.js'
import { HOUSE_VENDOR } from '../lib/paintbox.js'

describe('paints store: groups used for Auto', () => {
  let paints
  beforeEach(() => {
    setActivePinia(createPinia())
    paints = usePaintsStore()
  })
  const forms = () => new Set(paints.autoCandidates.flatMap((p) => p.forms.map((f) => f.split(' ').at(-1))))
  const vendors = () => new Set(paints.autoCandidates.map((p) => p.vendor))

  it('leaves the travel box out until its group is ticked', () => {
    expect(vendors().has('Travelbox')).toBe(false)
    paints.setAutoGroup('travelbox', true)
    expect(paints.autoCandidates.filter((p) => p.vendor === 'Travelbox')).toHaveLength(17)
  })

  it('drops the paints of an unticked group, but keeps a paint that is also in a ticked one', () => {
    paints.setAutoGroup('pan', false)
    const left = paints.autoCandidates.filter((p) => p.vendor === HOUSE_VENDOR)
    expect(left.length).toBeGreaterThan(0)
    expect(left.every((p) => p.forms.some((f) => f.includes('tube')))).toBe(true)
    paints.setAutoGroup('vendor:Michael Harding', false)
    expect(vendors().has('Michael Harding')).toBe(false)
  })

  it('holds back a paint of the house series outside the default selection', () => {
    expect(paints.autoCandidates.some((p) => p.id === 'schmincke-horadam-336')).toBe(false)
    expect(forms().has('pan')).toBe(true)
  })
})
