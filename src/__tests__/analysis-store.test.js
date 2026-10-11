import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { segmentImage } from '../lib/segment.js'
import { layerImage } from '../lib/layers.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'

// Stands in for the Web Worker: copies every message the way postMessage does (which refuses
// what cannot be cloned) and answers only when the test says so, in the order of the jobs.
class FakeWorker {
  static queue = []
  static listeners = new Set()
  addEventListener(_, fn) { FakeWorker.listeners.add(fn) }
  removeEventListener(_, fn) { FakeWorker.listeners.delete(fn) }
  postMessage(data) { FakeWorker.queue.push(structuredClone(data)) }
}
globalThis.Worker = FakeWorker

// Answer the oldest waiting job.
async function answer() {
  const { jobId, kind, rgba, width, height, ...options } = FakeWorker.queue.shift()
  const result = kind === 'layers' ? layerImage(rgba, width, height, options.paints, options) : segmentImage(rgba, width, height, options)
  for (const fn of [...FakeWorker.listeners]) fn({ data: { jobId, result } })
  await new Promise((resolve) => setTimeout(resolve))
}
const waiting = () => FakeWorker.queue.length

function picture(width = 24, height = 16, seed = 0) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const blocks = [[250, 228, 20], [43, 97, 171], [230, 51, 29], [255, 255, 255]]
  for (let p = 0; p < width * height; p++) {
    const x = p % width, y = Math.floor(p / width)
    rgba.set([...blocks[(Math.floor(x / 6) + Math.floor(y / 8) + seed) % 4], 255], p * 4)
  }
  return { rgba, width, height }
}

let analysis, paints
beforeEach(() => {
  setActivePinia(createPinia())
  FakeWorker.queue.length = 0
  FakeWorker.listeners.clear()
  analysis = useAnalysisStore()
  paints = usePaintsStore()
  analysis.pixels = picture()
  Object.assign(analysis.settings, { colours: 4, simplify: 0, saturation: 100, contrast: 100, layerCount: 2, maxCoats: 1 })
})

const stockIds = (n) => paints.autoCandidates.slice(0, n).map((p) => p.id)

async function toLayerMode() {
  analysis.setMode('layer')
  while (waiting()) await answer()
}

describe('layer mode in the analysis store', () => {
  it('plans layers with paints proposed by the app and writes them into the paint box', async () => {
    const mix = [...paints.activeBox.paintIds]
    await toLayerMode()
    expect(analysis.error).toBeNull()
    expect(analysis.busy).toBe(false)
    expect(analysis.layers.layers.length).toBeGreaterThan(0)
    expect(paints.activeBox.layerIds).toEqual(analysis.layers.paintIds)
    expect(paints.activeBox.layerAuto).toBe(true)
    expect(paints.activeBox.paintIds).toEqual(mix)
    expect(analysis.layerShown).toEqual(analysis.layers.layers.map(() => true))
  })

  it('plans layers with base paints chosen by hand', async () => {
    const ids = stockIds(2)
    paints.setLayerPaints(ids)
    await toLayerMode()
    expect(analysis.error).toBeNull()
    expect([...analysis.layers.paintIds].sort()).toEqual([...ids].sort())
    expect(paints.activeBox.layerAuto).toBe(false)
  })

  it('stays busy until the latest of several analyses is done', async () => {
    analysis.setMode('layer')
    analysis.analyse()
    analysis.analyse()
    expect(waiting()).toBe(3)
    await answer()
    expect(analysis.busy).toBe(true)
    expect(analysis.layers).toBeNull()
    await answer()
    expect(analysis.busy).toBe(true)
    await answer()
    expect(analysis.busy).toBe(false)
    expect(analysis.layers).not.toBeNull()
  })

  it('shows blank paper without base paints, also when an older job answers afterwards', async () => {
    await toLayerMode()
    analysis.analyse() // still running when the paint box is cleared
    const version = analysis.renderVersion
    paints.setLayerPaints([])
    analysis.recomputeAllRecipes()
    expect(analysis.layers).toBeNull()
    expect(analysis.busy).toBe(false)
    expect(analysis.renderVersion).toBeGreaterThan(version)
    await answer()
    expect(analysis.layers).toBeNull()
    expect(paints.activeBox.layerIds).toEqual([])
    expect(paints.activeBox.layerAuto).toBe(false)
  })

  it('does not apply a result to the other mode', async () => {
    analysis.analyse() // mix
    analysis.setMode('layer')
    analysis.setMode('mix')
    expect(waiting()).toBe(3)
    await answer()
    expect(analysis.segmentation).toBeNull()
    await answer()
    expect(analysis.layers).toBeNull()
    expect(analysis.busy).toBe(true)
    await answer()
    expect(analysis.busy).toBe(false)
    expect(analysis.segmentation).not.toBeNull()
    expect(analysis.entries.length).toBeGreaterThan(0)
  })

  it('writes a proposal into the box it was made for', async () => {
    analysis.setMode('layer')
    paints.addBox('Second')
    const ids = stockIds(2)
    paints.setLayerPaints(ids)
    await answer()
    expect(paints.activeBox.layerIds).toEqual(ids)
    expect(paints.activeBox.layerAuto).toBe(false)
    expect(paints.boxes[0].layerIds).toEqual(analysis.layers.paintIds)
  })

  it('brings the mixes back unchanged after a visit to layer mode', async () => {
    analysis.analyse()
    await answer()
    analysis.setTarget(0, '#123456')
    const labels = analysis.entries.map((e) => e.label)
    await toLayerMode()
    analysis.setMode('mix')
    expect(waiting()).toBe(0)
    expect(analysis.busy).toBe(false)
    expect(analysis.entries[0]).toMatchObject({ targetHex: '#123456', overridden: true })
    expect(analysis.entries.map((e) => e.label)).toEqual(labels)
    expect(analysis.exportEdits()).toEqual([{ index: 0, targetHex: '#123456', chosen: 0 }])
  })

  it('analyses the mixes again when the picture was changed in layer mode', async () => {
    analysis.analyse()
    await answer()
    analysis.setTarget(0, '#123456')
    await toLayerMode()
    expect(analysis.exportEdits()).toHaveLength(1)
    analysis.settings.simplify = 3
    analysis.analyse()
    await answer()
    // The mixes are those of other settings now: their colour changes are not this picture's.
    expect(analysis.exportEdits()).toEqual([])
    analysis.setMode('mix')
    expect(waiting()).toBe(1)
    await answer()
    expect(analysis.entries.some((e) => e.overridden)).toBe(false)
  })

  it('drops the mixes of the picture before when a new one comes in layer mode', async () => {
    analysis.analyse()
    await answer()
    analysis.setTarget(0, '#123456')
    await toLayerMode()
    analysis.pixels = picture(20, 10, 1)
    analysis.forgetPicture()
    analysis.analyse()
    expect(analysis.exportEdits()).toEqual([])
    expect(analysis.entries).toEqual([])
    expect(analysis.layers).not.toBeNull() // stays on screen until the new layers are there
    // A click on the old layers while the new ones are planned.
    analysis.selectPoint({ x: 23, y: 15 })
    expect(analysis.layerSpot).toBeNull()
    analysis.goToStep(0)
    await answer()
    expect(analysis.layers.width).toBe(20)
    expect(analysis.layerPoint).toBeNull()
    expect(analysis.layerStep).toBeNull()
  })

  it('keeps the colour changes of a picture opened in layer mode for its first mix analysis', async () => {
    await toLayerMode()
    const edits = [{ index: 0, targetHex: '#123456', chosen: 0 }]
    analysis.pendingEdits = { key: '100/100/0/4/false', edits }
    expect(analysis.exportEdits()).toEqual(edits)
    analysis.setMode('mix')
    await answer()
    expect(analysis.pendingEdits).toBeNull()
    expect(analysis.entries[0]).toMatchObject({ targetHex: '#123456', overridden: true })
    expect(analysis.exportEdits()).toEqual(edits)
  })
})

describe('looking at the layers', () => {
  beforeEach(async () => {
    paints.setLayerPaints(stockIds(3))
    analysis.settings.maxCoats = 2
    await toLayerMode()
  })

  it('never hides the last layer', () => {
    const n = analysis.layers.layers.length
    expect(n).toBeGreaterThan(1)
    for (let k = 0; k < n; k++) analysis.showLayer(k, false)
    expect(analysis.layerView.filter(Boolean)).toHaveLength(1)
    expect(analysis.layerSolo).toBe(n - 1)
    analysis.soloLayer(n - 1)
    expect(analysis.layerView.every(Boolean)).toBe(true)
    expect(analysis.layerSolo).toBeNull()
  })

  it('walks through the steps and stops at both ends', () => {
    const { steps, layers } = analysis.layers
    analysis.goToStep(-3)
    expect(analysis.layerStep).toBe(0)
    expect(analysis.layerSolo).toBeNull()
    expect(analysis.layerView).toEqual(layers.map((_, k) => (k < steps[0].layer ? true : k === steps[0].layer ? steps[0].coat : false)))
    analysis.goToStep(99)
    expect(analysis.layerStep).toBe(steps.length - 1)
    analysis.showLayer(0, false)
    expect(analysis.layerStep).toBeNull()
    analysis.goToStep(1)
    analysis.goToStep(null)
    expect(analysis.layerStep).toBeNull()
    expect(analysis.layerView.every(Boolean)).toBe(true)
  })

  it('has no walk for a picture without a single coat', async () => {
    analysis.pixels = { rgba: new Uint8ClampedArray(8 * 8 * 4).fill(255), width: 8, height: 8 }
    analysis.forgetPicture()
    analysis.analyse()
    await answer()
    expect(analysis.layers.steps).toEqual([])
    analysis.goToStep(0)
    expect(analysis.layerStep).toBeNull()
    expect(analysis.layerView.every(Boolean)).toBe(true)
  })

  it('tells what a spot gets, at the corners too, and nothing outside the picture', () => {
    const { width, height, layers } = analysis.layers
    for (const point of [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: 0, y: height - 1 }, { x: width - 1, y: height - 1 }]) {
      analysis.selectPoint(point)
      const spot = analysis.layerSpot
      expect(spot.coats).toHaveLength(layers.length)
      expect(spot.photo).toMatch(/^#[0-9a-f]{6}$/)
      expect(Number.isFinite(spot.deltaE)).toBe(true)
    }
    analysis.selectPoint({ x: width, y: 0 })
    expect(analysis.layerSpot).toBeNull()
    analysis.selectPoint(null)
    expect(analysis.layerSpot).toBeNull()
  })

  it('ignores the layer actions while there are no layers', () => {
    analysis.layers = null
    analysis.selectPoint({ x: 1, y: 1 })
    expect(analysis.layerSpot).toBeNull()
    expect(analysis.layerView).toEqual([])
    expect(analysis.layerSolo).toBeNull()
    expect(() => { analysis.soloLayer(0); analysis.showLayer(0, true); analysis.goToStep(0) }).not.toThrow()
    expect(analysis.layerStep).toBeNull()
  })
})

describe('base paints in the paint box', () => {
  it('keeps the base paints and the mix selection apart', () => {
    const mix = [...paints.activeBox.paintIds]
    const [a, b] = stockIds(2)
    paints.toggleLayerPaint(a)
    paints.toggleLayerPaint(b, true)
    paints.toggleLayerPaint(b, true)
    expect(paints.activeBox.layerIds).toEqual([a, b])
    expect(paints.activeBox.layerAuto).toBe(false)
    expect(paints.activeBox.paintIds).toEqual(mix)
    expect(paints.activeBox.auto).toBe(true)
    paints.toggle(a, false)
    expect(paints.activeBox.layerIds).toEqual([a, b])
    paints.toggleLayerPaint(a)
    expect(paints.activeBox.layerIds).toEqual([b])
    paints.setLayerPaints([])
    expect(paints.activeBox.paintIds).toEqual(mix.filter((id) => id !== a))
  })

  it('takes six base paints at most and gives every box its own', () => {
    paints.setLayerPaints(paints.all.slice(0, 9).map((p) => p.id))
    expect(paints.activeBox.layerIds).toHaveLength(MAX_LAYER_PAINTS)
    paints.addBox('Second')
    expect(paints.activeBox.layerIds).toEqual([])
    expect(paints.activeBox.layerAuto).toBe(true)
    expect(paints.boxes[0].layerIds).toHaveLength(MAX_LAYER_PAINTS)
  })

  it('removes a deleted own paint from the base paints of every box', () => {
    paints.savePaint({ vendor: 'X', number: '1', name: 'Own', form: 'pan', hex: '#336699' })
    const own = paints.custom[0].id
    paints.setLayerPaints([own, stockIds(1)[0]])
    paints.addBox('Second')
    paints.setLayerPaints([own])
    paints.deletePaint(own)
    expect(paints.boxes.map((b) => b.layerIds)).toEqual([[stockIds(1)[0]], []])
    expect(paints.layerPaints).toEqual([])
  })
})
