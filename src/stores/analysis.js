import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { findRecipes, proposePaints, washRecipe, washLetter } from '../lib/mixing.js'
import { adjustImage, hexToOklab, oklabToHex, rgbToHex, deltaE } from '../lib/color.js'
import { planMixes, mixesToRequest } from '../lib/mixes.js'
import { usePaintsStore } from './paints.js'
import { renderLayers } from '../lib/layers.js'

// Working resolution: the picture is scaled down to about this many pixels, whatever its shape.
export const WORK_PIXELS = 800 * 600

// Recipes count as the same mix when they use the same paints.
const paintKey = (recipe) => recipe.paints.map((p) => p.paintId).sort().join('+')
// Sample photos; the Sample button steps through them, the first one loads at start.
const SAMPLES = [
  // Temporary: a press photo, to be replaced before anything is published.
  { file: 'sample-stage.webp', name: 'Stage (sample)' },
  { file: 'sample-portrait.webp', name: 'Portrait (sample)' },
  { file: 'sample-street-dusk.webp', name: 'Street at dusk (sample)' },
  { file: 'sample-cwm-idwal.webp', name: 'Cwm Idwal (sample)' },
]
let nextSample = 0

let worker = null
let jobCounter = 0
// Every analysis takes a number; only the latest one may write its result or end `busy`.
let analysisToken = 0
// Layer mode on Auto: the base paints are proposed once per picture and then kept, so that moving
// an unrelated slider does not swap the paints under the painter's hands.
let pictureSerial = 0
let layerProposal = null // "picture/box/count" the current proposal was made for
// The settings the mix analysis (`segmentation`) was made with, see `mixCurrent`.
let mixKey = null
const mixKeyOf = ({ saturation, contrast, simplify, colours }) => [saturation, contrast, simplify, colours].join('/')

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/segment.worker.js', import.meta.url), { type: 'module' })
  }
  return worker
}

// One job for the worker; `kind: 'layers'` asks for layer mode instead of the mix analysis.
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

// Waits for `load` rather than `decode()`: decoding is put off while the tab is in the background,
// which would leave a picture opened there "Analysing" until the tab is looked at.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('the file is not a picture this browser can read'))
    img.src = src
  })
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
    mixRecipes: {}, // mix (group) -> its recipes, fitted to the largest wash of the mix (raw)
    renderVersion: 0, // bumped whenever the canvas needs a redraw
    selectedEntry: null,
    selectedRegion: null,
    // Layer mode (glazing): the picture as coats of a few base paints.
    layers: null, // result of layerImage (raw); null until analysed or without base paints
    layerShown: [], // per layer: shown in the picture
    layerStep: null, // index into layers.steps while the painting order is walked through
    layerPoint: null, // { x, y } of the clicked spot, in working pixels
    pendingEdits: null, // { key, edits } of a picture opened in layer mode, for its first mix analysis
    busy: false,
    error: null,
    settings: {
      mode: 'mix', // mix = colours mixed on the palette; layer = glazes of a few base paints
      layerCount: 5, // layer mode: base paints the app proposes
      layerSimplify: 4, // layer mode: its own "Simplify areas"; every layer has to be painted by hand
      layerAccents: 2, // layer mode: accent layers at most (a strong wash on small areas, painted last)
      maxCoats: 2, // layer mode: coats of one wash an area can get
      colours: 20,
      simplify: 0,
      maxPaints: 3,
      variety: 5, // 0 = the picture as accurate as possible, 10 = small areas of another hue keep their mix
      saturation: 200, // percent, applied to the photo before the analysis
      contrast: 100,
      view: 'mixed', // mixed | target | original
      outlines: true,
      numbers: true,
    },
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    layerMode: (state) => state.settings.mode === 'layer',
    /**
     * What the picture shows of each layer: true = all its coats, false = none, a number = that
     * many coats. While the painting order is walked through, it is the paper after that step.
     */
    layerView(state) {
      if (!state.layers) return []
      const step = state.layerStep == null ? null : state.layers.steps[state.layerStep]
      if (!step) return state.layers.layers.map((_, k) => state.layerShown[k] !== false)
      return state.layers.layers.map((_, k) => (k < step.layer ? true : k === step.layer ? step.coat : false))
    },
    /**
     * The number a layer goes by in the interface: painted layers count 1, 2, 3 in painting order;
     * a paint that got no layer has none (null).
     */
    layerNumbers(state) {
      let n = 0
      return state.layers ? state.layers.layers.map((layer) => (layer.top > 0 ? ++n : null)) : []
    },
    /** The one layer shown on its own, or null. */
    layerSolo() {
      if (this.layerStep != null) return null
      const shown = this.layerView.map((v, k) => (v ? k : -1)).filter((k) => k >= 0)
      return shown.length === 1 ? shown[0] : null
    },
    /** What the clicked spot gets: photo colour, layered colour and the coats of every layer. */
    layerSpot(state) {
      const result = state.layers
      const point = state.layerPoint
      if (!result || !point || !state.pixels) return null
      const source = state.adjusted ?? state.pixels
      // The layers of another picture (a new one is being planned) say nothing about this one.
      if (source.width !== result.width || source.height !== result.height) return null
      if (!(point.x >= 0 && point.y >= 0 && point.x < result.width && point.y < result.height)) return null
      const p = point.y * result.width + point.x
      const combo = result.combos[result.comboMap[p]]
      const photo = rgbToHex([source.rgba[p * 4], source.rgba[p * 4 + 1], source.rgba[p * 4 + 2]])
      return {
        photo,
        layered: combo.hex,
        deltaE: deltaE(hexToOklab(photo), hexToOklab(combo.hex)),
        coats: combo.coats,
      }
    },
    /** Number of different mixes; the washes of a mix count once. */
    mixCount: (state) => new Set(state.entries.map((e) => e.family)).size,
    usedPaintIds: (state) => {
      const ids = new Set()
      for (const e of state.entries) e.recipes[e.chosen]?.paints.forEach((p) => ids.add(p.paintId))
      return ids
    },
  },
  actions: {
    /** Load the next sample photo; `restart` goes back to the first one (used at start). */
    async loadSample(restart = false) {
      if (restart) nextSample = 0
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
      // Pictures saved before layer mode existed are mix pictures.
      Object.assign(this.settings, { mode: 'mix' }, record.settings)
      const url = URL.createObjectURL(record.blob)
      await this.loadFromSource(url, record.name)
      URL.revokeObjectURL(url)
      if (this.error) return
      this.savedId = record.id
      // The colour changes belong to the mixes. In layer mode they wait for the first mix analysis.
      if (this.layerMode) this.pendingEdits = { key: mixKeyOf(this.settings), edits: record.edits ?? [] }
      else this.applyEdits(record.edits)
    },
    /** Saved colour changes onto the colours of a fresh mix analysis. */
    applyEdits(edits) {
      for (const edit of edits ?? []) {
        const entry = this.entries[edit.index]
        if (!entry) continue
        if (edit.targetHex) this.setTarget(edit.index, edit.targetHex)
        if (entry.recipes[edit.chosen]) entry.chosen = edit.chosen
      }
      this.renderVersion++
    },
    /** Whether the mixes belong to the picture and the settings as they are now. */
    mixCurrent() {
      return !!this.segmentation && mixKey === mixKeyOf(this.settings)
    },
    /** Colour changes worth saving. Detached areas are not kept: they depend on the exact area ids. */
    exportEdits() {
      // In layer mode the mixes can be those of other settings: then the saved changes are kept as they were.
      if (!this.mixCurrent()) return this.pendingEdits?.edits ?? []
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
        this.forgetPicture()
        await this.analyse()
      } catch (e) {
        this.error = `Could not load image: ${e.message}`
      }
    },

    /**
     * A new picture. What the other mode worked out belongs to the picture before and is dropped;
     * the current mode keeps its result on screen until the new one is there.
     */
    forgetPicture() {
      pictureSerial++
      mixKey = null
      this.pendingEdits = null
      if (this.layerMode) {
        this.segmentation = null
        this.entries = []
        this.order = []
        this.baseEntries = 0
        this.regionEntry = null
        this.mixRecipes = {}
        this.selectedEntry = null
        this.selectedRegion = null
      } else {
        this.layers = null
        this.layerShown = []
      }
    },

    async analyse() {
      if (!this.pixels) return
      const token = ++analysisToken
      this.busy = true
      this.error = null
      const { width, height } = this.pixels
      const { saturation, contrast } = this.settings
      const rgba = adjustImage(this.pixels.rgba, { saturation: saturation / 100, contrast: contrast / 100 })
      this.adjusted = rgba === this.pixels.rgba ? null : markRaw({ rgba, width, height })
      if (this.layerMode) return this.analyseLayers(rgba, width, height, token)
      const key = mixKeyOf(this.settings)
      try {
        // "Colours" counts mixes. The analysis is asked for more, and planMixes joins them down to
        // the wanted number once the paints are known.
        const { result } = await runSegmentation({
          rgba: rgba.slice(),
          width,
          height,
          colours: mixesToRequest(this.settings.colours),
          simplify: this.settings.simplify,
        })
        if (token !== analysisToken || this.layerMode) return // a newer analysis superseded this one
        mixKey = key
        this.applySegmentation(result)
        // Colour changes of a picture that was opened in layer mode.
        const pending = this.pendingEdits
        this.pendingEdits = null
        if (pending?.key === key) this.applyEdits(pending.edits)
      } catch (e) {
        if (token === analysisToken) this.error = `Analysis failed: ${e.message}`
      } finally {
        // A superseded analysis leaves `busy` to the one that is still running.
        if (token === analysisToken) this.busy = false
      }
    },

    /**
     * Layer mode: glazes of the base paints. On Auto the app proposes the paints from the paint
     * box's Auto pool, otherwise the ones chosen in the paint box are fitted.
     */
    async analyseLayers(rgba, width, height, token = ++analysisToken) {
      const paints = usePaintsStore()
      const box = paints.activeBox
      const { layerCount, maxCoats, layerAccents } = this.settings
      const proposalKey = [pictureSerial, box.id, layerCount, maxCoats, layerAccents].join('/')
      // Propose only when there is nothing to keep: a new picture or box, another number of layers or
      // coats or accents (the best paints depend on those), or Auto pressed.
      const propose = box.layerAuto && !(layerProposal === proposalKey && box.layerIds.length)
      const pool = (propose ? paints.autoCandidates : paints.layerPaints).map(({ id, hex }) => ({ id, hex }))
      this.layerStep = null
      this.layerPoint = null
      try {
        if (!pool.length) {
          this.layers = null
          this.layerShown = []
          this.renderVersion++
          return
        }
        const { result } = await runSegmentation({
          kind: 'layers',
          rgba: rgba.slice(),
          width,
          height,
          paints: pool,
          // Auto: the number of wash layers (accent paints come on top). By hand: every chosen paint may be one.
          count: box.layerAuto ? this.settings.layerCount : undefined,
          // A plain copy: the worker cannot be sent the reactive array of the store.
          paintIds: propose ? undefined : [...box.layerIds],
          maxCoats: this.settings.maxCoats,
          simplify: this.settings.layerSimplify,
          accents: this.settings.layerAccents,
        })
        if (token !== analysisToken || !this.layerMode) return // superseded
        // The proposal goes to the box it was made for, also when another box was opened meanwhile.
        if (propose) {
          paints.setLayerPaints(result.paintIds, true, box)
          layerProposal = proposalKey
        }
        this.layers = markRaw(result)
        this.layerShown = result.layers.map(() => true)
        // A walk or a spot picked on the old layers while these were planned.
        this.layerStep = null
        this.layerPoint = null
        this.renderVersion++
      } catch (e) {
        if (token === analysisToken) this.error = `Analysis failed: ${e.message}`
      } finally {
        if (token === analysisToken) this.busy = false
      }
    },

    /** Layer mode: let the app choose the base paints for this picture (again). */
    proposeLayers() {
      layerProposal = null
      const paints = usePaintsStore()
      paints.setLayerPaints(paints.activeBox.layerIds, true)
      if (this.layerMode) this.analyse()
    },

    /** Layer mode: the picture as RGBA at working resolution, for the current view. */
    layerPixels() {
      return this.layers ? renderLayers(this.layers, this.layerView) : null
    },

    setMode(mode) {
      if (mode === this.settings.mode) return
      this.settings.mode = mode
      if (mode === 'layer' && this.settings.view === 'target') this.settings.view = 'mixed'
      this.select(null)
      this.layerStep = null
      this.layerPoint = null
      if (mode === 'mix' && this.mixCurrent()) {
        // The mixes are still those of this picture: they come back with every colour change
        // made by hand, only the paint box may have changed. A running layer job is dropped.
        analysisToken++
        this.busy = false
        this.error = null
        this.recomputeAllRecipes()
        return
      }
      this.analyse()
    },

    /** Tick or untick a layer. The last one stays: a picture with nothing on it helps nobody. */
    showLayer(index, on) {
      if (!this.layers) return
      this.layerStep = null
      const next = this.layerView.map((v) => !!v)
      next[index] = on
      if (!next.some(Boolean)) return
      this.layerShown = next
      this.renderVersion++
    },

    /** One layer on its own; again on the same layer, or with null, all of them. */
    soloLayer(index) {
      if (!this.layers) return
      const solo = this.layerStep == null && this.layerSolo === index
      this.layerStep = null
      this.layerShown = this.layers.layers.map((_, k) => index == null || solo || k === index)
      this.renderVersion++
    },

    /** Walk through the painting order: step = index into layers.steps, null ends the walk. */
    goToStep(step) {
      if (!this.layers) return
      // Without a single coat (a white picture) there is nothing to walk through.
      this.layerStep = step == null || !this.layers.steps.length ? null : Math.min(this.layers.steps.length - 1, Math.max(0, step))
      if (this.layerStep == null) this.layerShown = this.layers.layers.map(() => true)
      this.renderVersion++
    },

    selectPoint(point) {
      this.layerPoint = point
      this.renderVersion++
    },

    applySegmentation(result) {
      this.segmentation = markRaw(result)
      this.entries = []
      this.baseEntries = 0
      this.regionEntry = null
      this.selectedEntry = null
      this.selectedRegion = null
      this.autoPaints()
      this.recomputeAllRecipes()
    },

    /** While the paint box is on Auto, pick the paints that suit the colours of this picture. */
    autoPaints(force = false) {
      const paints = usePaintsStore()
      if (!this.segmentation || !(force || paints.activeBox.auto)) return
      // Every wash is a target: a wash its mix cannot reach needs paints for a mix of its own.
      const targets = this.segmentation.clusters.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
      paints.setEnabled(proposePaints(targets, paints.autoCandidates, { maxPaints: this.settings.maxPaints }), true)
    },

    /**
     * Build the colours and their recipes from the analysis and the paint box.
     *
     * The analysis delivers mixes, each split into washes. A mix gets its recipes from its largest
     * wash; every other wash is that recipe with more or less water. Washes that end up on the same
     * water level are the same instruction for the painter, so they become one colour.
     * Colours changed by hand, detached areas and picked recipes are carried over where they still fit.
     */
    recomputeAllRecipes() {
      // Layer mode has no recipes: a changed paint box means the layers are planned again.
      if (this.layerMode) return this.analyse()
      const seg = this.segmentation
      if (!seg) return
      const paints = usePaintsStore().enabled
      const byId = usePaintsStore().byId
      const total = seg.width * seg.height
      const old = this.entries
      const oldRegionEntry = this.regionEntry

      const washOf = (recipe, hex) => (recipe.paints.length ? washRecipe(recipe, hex, byId) : recipe)
      const groups = planMixes(seg.clusters, paints, {
        maxPaints: this.settings.maxPaints,
        wanted: this.settings.colours,
        variety: this.settings.variety,
      })
      const mixRecipes = {}
      const built = []
      for (const { group, clusters, recipes } of groups) {
        mixRecipes[group] = recipes
        let items = clusters.map((c) => ({ clusters: [c.index], pixels: c.pixelCount, lab: hexToOklab(c.hex) }))
        // Merge washes until every water level of the mix occurs once.
        for (;;) {
          const levels = new Map()
          for (const item of items) {
            item.hex = oklabToHex(item.lab)
            item.letter = recipes.length ? washLetter(washOf(recipes[0], item.hex).strength) : ''
            const same = levels.get(item.letter)
            if (same) {
              const n = same.pixels + item.pixels
              same.lab = same.lab.map((v, j) => (v * same.pixels + item.lab[j] * item.pixels) / n)
              same.pixels = n
              same.clusters.push(...item.clusters)
            } else {
              levels.set(item.letter, item)
            }
          }
          if (levels.size === items.length) break
          items = [...levels.values()]
        }
        for (const item of items) built.push({ group, ...item })
      }

      // Largest first, so the entry numbers used in saved pictures stay meaningful.
      built.sort((x, y) => y.pixels - x.pixels)
      const clusterToEntry = new Map()
      const entries = built.map((item, i) => {
        item.clusters.forEach((c) => clusterToEntry.set(c, i))
        return {
          id: i,
          group: item.group,
          letter: item.letter,
          sourceHex: item.hex,
          targetHex: item.hex,
          overridden: false,
          share: item.pixels / total,
          recipes: [],
          chosen: 0,
          family: `mix-${item.group}`,
          label: '',
        }
      })
      const regionEntry = Int32Array.from(seg.regions, (r) => clusterToEntry.get(r.cluster))

      // Carry over what the user changed.
      const pickedPaints = {}
      for (const e of old) if (!e.overridden && e.chosen && e.recipes[e.chosen]) pickedPaints[e.group] = paintKey(e.recipes[e.chosen])
      old.slice(0, this.baseEntries).forEach((e) => {
        if (!e.overridden) return
        const match = entries.find((n) => n.group === e.group && n.letter === e.letter)
        if (match) Object.assign(match, { targetHex: e.targetHex, overridden: true, kept: e.chosen ? paintKey(e.recipes[e.chosen]) : null })
      })
      const baseEntries = entries.length
      old.slice(this.baseEntries).forEach((e, n) => {
        const id = entries.length
        const oldIndex = this.baseEntries + n
        let size = 0
        seg.regions.forEach((region, r) => {
          if (oldRegionEntry[r] !== oldIndex) return
          const from = entries[regionEntry[r]]
          if (from) from.share -= region.size / total
          regionEntry[r] = id
          size += region.size
        })
        entries.push({ ...e, id, share: size / total, recipes: [], kept: e.chosen ? paintKey(e.recipes[e.chosen]) : null })
      })

      this.mixRecipes = markRaw(mixRecipes)
      this.entries = entries
      this.baseEntries = baseEntries
      this.regionEntry = markRaw(regionEntry)
      this.entries.forEach((entry, i) => {
        this.recomputeRecipes(i, false)
        const wanted = entry.overridden ? entry.kept : pickedPaints[entry.group]
        if (wanted) entry.chosen = Math.max(0, entry.recipes.findIndex((r) => paintKey(r) === wanted))
        delete entry.kept
      })
      if (this.selectedEntry != null && !this.entries[this.selectedEntry]) this.selectedEntry = null
      this.relabel()
      this.renderVersion++
    },

    /** Recipes of one colour: washes of its mix, or recipes of its own once its colour was changed by hand. */
    recomputeRecipes(index, redraw = true) {
      const store = usePaintsStore()
      const entry = this.entries[index]
      if (entry.overridden) {
        entry.family = `own-${index}`
        entry.recipes = findRecipes(entry.targetHex, store.enabled, { maxPaints: this.settings.maxPaints, limit: 5 })
      } else {
        entry.family = `mix-${entry.group}`
        entry.recipes = (this.mixRecipes[entry.group] ?? []).map((r) =>
          r.paints.length ? washRecipe(r, entry.targetHex, store.byId) : r,
        )
      }
      entry.chosen = 0
      if (redraw) {
        this.relabel()
        this.renderVersion++
      }
    },

    /**
     * Labels: one number per mix, largest first. A mix painted in several washes adds a letter
     * for the water level: 6L is mix 6 as a light wash, 6R the same mix rich.
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
          const washes = new Set(family.members.map((i) => this.entries[i].letter)).size > 1
          for (const i of family.members) {
            this.entries[i].label = `${n + 1}${washes ? this.entries[i].letter : ''}`
            this.order.push(i)
          }
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
      this.recomputeRecipes(index)
    },

    resetTarget(index) {
      this.setTarget(index, this.entries[index].sourceHex)
    },

    /** A recipe is picked for the whole mix: all its washes change with it. */
    chooseRecipe(index, recipeIndex) {
      const { family } = this.entries[index]
      for (const entry of this.entries) if (entry.family === family && entry.recipes[recipeIndex]) entry.chosen = recipeIndex
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
        group: source.group,
        letter: source.letter,
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
