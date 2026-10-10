import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { findRecipes } from '../lib/mixing.js'
import { usePaintsStore } from './paints.js'

export const WORK_SIZE = 640
// Sample photos; the Sample button steps through them, the first one loads at start.
const SAMPLES = [
  { file: 'sample-street-dusk.webp', name: 'Street at dusk (sample)' },
  { file: 'sample-cwm-idwal.webp', name: 'Cwm Idwal (sample)' },
]
let nextSample = 0

let worker = null
let jobCounter = 0

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/segment.worker.js', import.meta.url), { type: 'module' })
  }
  return worker
}

function runSegmentation(payload) {
  const jobId = ++jobCounter
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.data.jobId !== jobId) return
      w.removeEventListener('message', onMessage)
      if (event.data.error) reject(new Error(event.data.error))
      else resolve({ jobId, result: event.data.result })
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ jobId, ...payload })
  })
}

async function loadImage(src) {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  return img
}

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    imageName: 'Cwm Idwal (sample)',
    image: null, // HTMLImageElement (raw)
    pixels: null, // { rgba, width, height } at working resolution (raw)
    segmentation: null, // raw result from worker
    entries: [], // palette entries
    regionEntry: null, // Int32Array region -> entry index (raw)
    renderVersion: 0, // bumped whenever the canvas needs a redraw
    selectedEntry: null,
    selectedRegion: null,
    busy: false,
    error: null,
    settings: {
      colours: 12,
      simplify: 4,
      maxPaints: 3,
      view: 'mixed', // mixed | target | original
      outlines: true,
      numbers: true,
    },
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    usedPaintIds: (state) => {
      const ids = new Set()
      for (const e of state.entries) e.recipes[e.chosen]?.paints.forEach((p) => ids.add(p.paintId))
      return ids
    },
  },
  actions: {
    async loadSample() {
      const sample = SAMPLES[nextSample]
      nextSample = (nextSample + 1) % SAMPLES.length
      await this.loadFromSource(`${import.meta.env.BASE_URL}${sample.file}`, sample.name)
    },
    async loadFile(file) {
      const url = URL.createObjectURL(file)
      await this.loadFromSource(url, file.name)
    },
    async loadFromSource(src, name) {
      this.error = null
      try {
        const img = await loadImage(src)
        const scale = Math.min(1, WORK_SIZE / Math.max(img.naturalWidth, img.naturalHeight))
        const width = Math.max(1, Math.round(img.naturalWidth * scale))
        const height = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, width, height)
        const { data } = ctx.getImageData(0, 0, width, height)
        this.image = markRaw(img)
        this.pixels = markRaw({ rgba: data, width, height })
        this.imageName = name
        await this.analyse()
      } catch (e) {
        this.error = `Could not load image: ${e.message}`
      }
    },

    async analyse() {
      if (!this.pixels) return
      this.busy = true
      this.error = null
      const { rgba, width, height } = this.pixels
      try {
        const { jobId, result } = await runSegmentation({
          rgba: rgba.slice(),
          width,
          height,
          colours: this.settings.colours,
          simplify: this.settings.simplify,
        })
        if (jobId !== jobCounter) return // a newer analysis superseded this one
        this.applySegmentation(result)
      } catch (e) {
        this.error = `Analysis failed: ${e.message}`
      } finally {
        this.busy = false
      }
    },

    applySegmentation(result) {
      // Palette entries ordered by area (largest first) so numbers are stable and meaningful.
      const used = result.clusters.filter((c) => c.pixelCount > 0).sort((a, b) => b.pixelCount - a.pixelCount)
      const clusterToEntry = new Map(used.map((c, i) => [c.index, i]))
      const total = result.width * result.height
      this.entries = used.map((c, i) => ({
        id: i,
        sourceHex: c.hex,
        targetHex: c.hex,
        overridden: false,
        share: c.pixelCount / total,
        recipes: [],
        chosen: 0,
      }))
      this.regionEntry = markRaw(Int32Array.from(result.regions, (r) => clusterToEntry.get(r.cluster)))
      this.segmentation = markRaw(result)
      this.selectedEntry = null
      this.selectedRegion = null
      this.recomputeAllRecipes()
    },

    recomputeAllRecipes() {
      this.entries.forEach((_, i) => this.recomputeRecipes(i, false))
      this.renderVersion++
    },

    recomputeRecipes(index, redraw = true) {
      const paints = usePaintsStore().enabled
      const entry = this.entries[index]
      entry.recipes = findRecipes(entry.targetHex, paints, { maxPaints: this.settings.maxPaints, limit: 5 })
      entry.chosen = 0
      if (redraw) this.renderVersion++
    },

    select(regionId) {
      if (regionId == null || !this.regionEntry) {
        this.selectedEntry = null
        this.selectedRegion = null
        return
      }
      this.selectedRegion = regionId
      this.selectedEntry = this.regionEntry[regionId]
    },

    selectEntry(index) {
      this.selectedEntry = index
      this.selectedRegion = null
    },

    setTarget(index, hex) {
      const entry = this.entries[index]
      entry.targetHex = hex
      entry.overridden = hex.toLowerCase() !== entry.sourceHex.toLowerCase()
      this.recomputeRecipes(index)
    },

    resetTarget(index) {
      this.setTarget(index, this.entries[index].sourceHex)
    },

    chooseRecipe(index, recipeIndex) {
      this.entries[index].chosen = recipeIndex
      this.renderVersion++
    },

    /** Give the selected area its own palette entry so it can be recoloured independently. */
    detachRegion(regionId) {
      const from = this.regionEntry[regionId]
      const source = this.entries[from]
      const region = this.segmentation.regions[regionId]
      const total = this.segmentation.width * this.segmentation.height
      const id = this.entries.length
      this.entries.push({
        id,
        sourceHex: source.sourceHex,
        targetHex: source.targetHex,
        overridden: source.overridden,
        share: region.size / total,
        recipes: source.recipes,
        chosen: source.chosen,
      })
      source.share -= region.size / total
      this.regionEntry[regionId] = id
      this.selectedEntry = id
      this.renderVersion++
      return id
    },

    /** Display colour of a palette entry for the current view mode. */
    displayHex(entry) {
      if (this.settings.view === 'target') return entry.targetHex
      return entry.recipes[entry.chosen]?.hex ?? entry.targetHex
    },
  },
})
