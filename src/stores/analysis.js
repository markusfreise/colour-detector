import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { findRecipes, proposePaints, planWashes, washLetter } from '../lib/mixing.js'
import { adjustImage } from '../lib/color.js'
import { usePaintsStore } from './paints.js'

// Working resolution: the picture is scaled down to about this many pixels, whatever its shape.
export const WORK_PIXELS = 800 * 600

// Recipes count as the same mix when they use the same paints.
const paintKey = (recipe) => recipe.paints.map((p) => p.paintId).sort().join('+')
// Sample photos; the Sample button steps through them, the first one loads at start.
const SAMPLES = [
  { file: 'sample-portrait.webp', name: 'Portrait (sample)' },
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
    imageName: '',
    savedId: null, // id in the collection when the picture was saved or opened from it
    image: null, // HTMLImageElement (raw)
    pixels: null, // { rgba, width, height } at working resolution (raw)
    adjusted: null, // the same pixels with saturation and contrast applied, null when both are at 100 (raw)
    segmentation: null, // raw result from worker
    entries: [], // palette entries
    order: [], // entry indices in the order of their labels (mix by mix, lightest wash first)
    baseEntries: 0, // entries that came from the analysis (detached areas are appended after them)
    regionEntry: null, // Int32Array region -> entry index (raw)
    renderVersion: 0, // bumped whenever the canvas needs a redraw
    selectedEntry: null,
    selectedRegion: null,
    busy: false,
    error: null,
    settings: {
      colours: 20,
      simplify: 0,
      maxPaints: 3,
      saturation: 100, // percent, applied to the photo before the analysis
      contrast: 100,
      view: 'mixed', // mixed | target | original
      outlines: true,
      numbers: true,
    },
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    /** Number of different mixes; colours that are washes of the same mix count once. */
    mixCount: (state) => new Set(state.entries.map((e) => e.family)).size,
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
    /** Open a picture from the collection with its saved settings and colour changes. */
    async loadSaved(record) {
      Object.assign(this.settings, record.settings)
      const url = URL.createObjectURL(record.blob)
      await this.loadFromSource(url, record.name)
      URL.revokeObjectURL(url)
      if (this.error) return
      this.savedId = record.id
      for (const edit of record.edits ?? []) {
        const entry = this.entries[edit.index]
        if (!entry) continue
        if (edit.targetHex) this.setTarget(edit.index, edit.targetHex)
        if (entry.recipes[edit.chosen]) entry.chosen = edit.chosen
      }
      this.renderVersion++
    },
    /** Colour changes worth saving. Detached areas are not kept: they depend on the exact area ids. */
    exportEdits() {
      return this.entries
        .slice(0, this.baseEntries)
        .map((e, index) => ({ index, targetHex: e.overridden ? e.targetHex : null, chosen: e.chosen }))
        .filter((e) => e.targetHex || e.chosen)
    },
    async loadFromSource(src, name) {
      this.error = null
      this.savedId = null
      try {
        const img = await loadImage(src)
        const scale = Math.min(1, Math.sqrt(WORK_PIXELS / (img.naturalWidth * img.naturalHeight)))
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
      const { width, height } = this.pixels
      const { saturation, contrast } = this.settings
      const rgba = adjustImage(this.pixels.rgba, { saturation: saturation / 100, contrast: contrast / 100 })
      this.adjusted = rgba === this.pixels.rgba ? null : markRaw({ rgba, width, height })
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
        family: i,
        label: String(i + 1),
      }))
      this.baseEntries = this.entries.length
      this.regionEntry = markRaw(Int32Array.from(result.regions, (r) => clusterToEntry.get(r.cluster)))
      this.segmentation = markRaw(result)
      this.selectedEntry = null
      this.selectedRegion = null
      this.autoPaints()
      this.recomputeAllRecipes()
    },

    /** While the paint box is on Auto, pick the paints that suit the colours of this picture. */
    autoPaints(force = false) {
      const paints = usePaintsStore()
      if (!this.entries.length || !(force || paints.activeBox.auto)) return
      const targets = this.entries.map((e) => ({ hex: e.targetHex, weight: e.share }))
      paints.setEnabled(proposePaints(targets, paints.autoCandidates, { maxPaints: this.settings.maxPaints }), true)
    },

    /**
     * Recipes for every colour. Colours that differ only in strength share one mix: the smaller
     * ones get the mix of the larger one with more or less water as their first recipe.
     * A recipe picked by hand stays picked as long as the same paints are still on offer.
     */
    recomputeAllRecipes() {
      const paints = usePaintsStore().enabled
      const kept = this.entries.map((e) => (e.chosen && e.recipes[e.chosen] ? paintKey(e.recipes[e.chosen]) : null))
      const own = this.entries.map((e) => findRecipes(e.targetHex, paints, { maxPaints: this.settings.maxPaints, limit: 5 }))
      const plan = planWashes(this.entries.map((e, i) => ({ hex: e.targetHex, weight: e.share, recipes: own[i] })), paints)
      this.entries.forEach((entry, i) => {
        const { family, wash } = plan[i]
        entry.family = family
        entry.recipes = wash ? [wash, ...own[i].filter((r) => paintKey(r) !== paintKey(wash))].slice(0, 5) : own[i]
        entry.chosen = kept[i] ? Math.max(0, entry.recipes.findIndex((r) => paintKey(r) === kept[i])) : 0
      })
      this.relabel()
      this.renderVersion++
    },

    /**
     * Labels: one number per mix, largest first. Washes of a mix carry a letter for their water level
     * (6L light, 6R rich); two washes on the same level are numbered from the lighter one (6R1, 6R2).
     */
    relabel() {
      const families = new Map()
      this.entries.forEach((e, i) => {
        if (!families.has(e.family)) families.set(e.family, { share: 0, members: [] })
        const family = families.get(e.family)
        family.share += e.share
        family.members.push(i)
      })
      const strength = (i) => this.entries[i].recipes[0]?.strength ?? 0
      this.order = []
      ;[...families.values()]
        .sort((a, b) => b.share - a.share)
        .forEach((family, n) => {
          family.members.sort((a, b) => strength(a) - strength(b) || a - b)
          const letters = family.members.map((i) => washLetter(strength(i)))
          const seen = {}
          family.members.forEach((i, m) => {
            const letter = letters[m]
            const repeated = letters.filter((l) => l === letter).length > 1
            seen[letter] = (seen[letter] ?? 0) + 1
            this.entries[i].label =
              family.members.length > 1 ? `${n + 1}${letter}${repeated ? seen[letter] : ''}` : String(n + 1)
            this.order.push(i)
          })
        })
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
      this.recomputeAllRecipes()
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
        family: source.family,
        label: source.label,
      })
      source.share -= region.size / total
      this.regionEntry[regionId] = id
      this.selectedEntry = id
      this.order.splice(this.order.indexOf(from) + 1, 0, id)
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
