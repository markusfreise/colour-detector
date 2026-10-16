import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePaintsStore } from '../stores/paints.js'
import { HOUSE_VENDOR } from '../lib/paintbox.js'

describe('paints store: boxes used for Auto', () => {
  let paints
  beforeEach(() => {
    setActivePinia(createPinia())
    paints = usePaintsStore()
  })
  const forms = () => new Set(paints.autoCandidates.flatMap((p) => p.forms.map((f) => f.split(' ').at(-1))))
  const vendors = () => new Set(paints.autoCandidates.map((p) => p.vendor))

  it('leaves the travel box out until its box is ticked', () => {
    expect(vendors().has('Travelbox')).toBe(false)
    paints.setAutoBox('travelbox', true)
    expect(paints.autoCandidates.filter((p) => p.vendor === 'Travelbox')).toHaveLength(17)
  })

  it('drops the paints of an unticked box, but keeps a paint that is also in a ticked one', () => {
    paints.setAutoBox('pan', false)
    const left = paints.autoCandidates.filter((p) => p.vendor === HOUSE_VENDOR)
    expect(left.length).toBeGreaterThan(0)
    expect(left.every((p) => p.forms.some((f) => f.includes('tube')))).toBe(true)
    paints.setAutoBox('vendor:Michael Harding', false)
    expect(vendors().has('Michael Harding')).toBe(false)
  })

  it('holds back a paint of the house series outside the default selection', () => {
    expect(paints.autoCandidates.some((p) => p.id === 'schmincke-horadam-336')).toBe(false)
    expect(forms().has('pan')).toBe(true)
  })
})

describe('paints store: paint boxes', () => {
  let paints
  beforeEach(() => {
    setActivePinia(createPinia())
    paints = usePaintsStore()
  })

  it('starts with the groups as boxes: pans, tubes, travel box and one per series', () => {
    const ids = paints.boxes.map((b) => b.id)
    expect(ids.slice(0, 3)).toEqual(['pan', 'tube', 'travelbox'])
    expect(ids).toContain('vendor:Michael Harding')
    expect(paints.boxes[0].name).toBe('Pans')
    expect(paints.boxes.find((b) => b.id === 'travelbox').paintIds).toHaveLength(17)
  })

  it('adds and removes colours, and keeps at least one box', () => {
    const box = paints.addBox('Mine')
    paints.addToBox(box.id, 'schmincke-horadam-336')
    paints.addToBox(box.id, 'schmincke-horadam-336')
    expect(box.paintIds).toEqual(['schmincke-horadam-336'])
    paints.removeFromBox(box.id, 'schmincke-horadam-336')
    expect(box.paintIds).toEqual([])
    for (const b of [...paints.boxes]) paints.deleteBox(b.id)
    expect(paints.boxes).toHaveLength(1)
  })

  it('takes a library colour as the paint already known, or as a new paint of ones own', () => {
    const box = paints.addBox('Mine')
    paints.addColourToBox(box.id, { vendor: 'schmincke horadam', number: '336', name: 'x', hex: '#000000' })
    expect(box.paintIds).toEqual(['schmincke-horadam-336'])
    paints.addColourToBox(box.id, { vendor: 'Winsor & Newton Professional', number: '1', name: 'Test Red', hex: '#cc2222' })
    expect(paints.custom).toHaveLength(1)
    expect(box.paintIds[1]).toBe(paints.custom[0].id)
  })

  it('exports a box and imports it again as a new box', () => {
    const box = paints.addBox('Travel')
    paints.addToBox(box.id, 'schmincke-horadam-336')
    paints.addColourToBox(box.id, { vendor: 'Own Brand', number: '7', name: 'Mud', hex: '#665544' })
    const file = JSON.parse(JSON.stringify(paints.exportBox(box.id)))
    expect(file.name).toBe('Travel')
    expect(file.paints).toHaveLength(2)

    setActivePinia(createPinia())
    const fresh = usePaintsStore()
    const back = fresh.importBox(file)
    expect(back.name).toBe('Travel')
    expect(back.paintIds[0]).toBe('schmincke-horadam-336')
    expect(fresh.byId[back.paintIds[1]]).toMatchObject({ vendor: 'Own Brand', number: '7', name: 'Mud', hex: '#665544' })
    expect(() => fresh.importBox({ name: 'x' })).toThrow()
  })

  it('takes over the palette of a saved picture', () => {
    paints.setPalette({ paintIds: ['schmincke-horadam-336'], auto: false })
    expect([...paints.enabledIds]).toEqual(['schmincke-horadam-336'])
    expect(paints.palette.layerAuto).toBe(true)
  })
})
