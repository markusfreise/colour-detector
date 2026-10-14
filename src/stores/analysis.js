import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { findRecipes, proposePaints, washRecipe, washLetter, valueReach } from '../lib/mixing.js'
import { adjustImage, hexToOklab, oklabToHex, rgbToHex, deltaE } from '../lib/color.js'
import { planMixes, mixesToRequest } from '../lib/mixes.js'
import { usePaintsStore } from './paints.js'
import { renderLayers } from '../lib/layers.js'
import { useAiStore } from './ai.js'
import { aiRequest, readAiAnswer, aiCost, aiImageSize } from '../lib/ai.js'
import { boxMask, detailWash } from '../lib/details.js'
import { toOklabPixels, SIMPLIFY_ZERO } from '../lib/segment.js'
import { closeupSize } from '../lib/closeup.js'
import { useProStore } from './pro.js'

// Working resolution: the picture is scaled down to about this many pixels, whatever its shape.
export const WORK_PIXELS = 800 * 600
// Value mode: the values a grey picture is split into at most, and the least factor of strength
// (log) between two of them.
const VALUE_STEPS = 24
const VALUE_STEP = 0.15

// Recipes count as the same mix when they use the same paints.
const paintKey = (recipe) => recipe.paints.map((p) => p.paintId).sort().join('+')
// Sample pictures, offered in the sample library (SampleDialog.vue); the first one loads at start.
// They are Markus Freise's own works (see public/imprint), no longer than 1024 px.
export const SAMPLES = [
  { file: 'sample-bielefeld.webp', name: 'Bielefeld' },
  { file: 'sample-llyn-idwal.webp', name: 'Llyn Idwal' },
  { file: 'sample-rooftops-dusk.webp', name: 'Rooftops at dusk' },
  { file: 'sample-winter-fields.webp', name: 'Winter fields' },
  { file: 'sample-old-town-snow.webp', name: 'Old town in snow' },
].map((sample) => ({ url: `${import.meta.env.BASE_URL}${sample.file}`, name: sample.name, local: false }))
// Pictures in `local-samples/` exist only in this checkout: the folder is not in the repo, and the
// list is filled by the dev server only (vite.config.js). "white-dress.webp" → "White dress".
for (const file of __LOCAL_SAMPLES__) {
  const title = file.replace(/\.\w+$/, '').replace(/-/g, ' ')
  SAMPLES.push({ url: `${import.meta.env.BASE_URL}local-samples/${file}`, name: `${title[0].toUpperCase()}${title.slice(1)}`, local: true })
}

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
let sketchRunning = null // the picture a sketch is being worked out for
const mixKeyOf = ({ saturation, contrast, simplify, colours, geometric, values }, plan = 0) => [saturation, contrast, simplify, colours, !!geometric, plan].join('/') + (values ? '/values' : '')

// A small JPEG of the picture for the AI model: enough to judge colours, cheap to send, and
// re-encoded from pixels, so it carries no metadata of the photo.
function smallCopy({ rgba, width, height }) {
  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const size = aiImageSize(width, height)
  const small = document.createElement('canvas')
  small.width = size.width
  small.height = size.height
  const ctx = small.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, 0, 0, size.width, size.height)
  return { mediaType: 'image/jpeg', base64: small.toDataURL('image/jpeg', 0.82).split(',')[1], width: size.width, height: size.height }
}

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
    // The colour being looked at: { entry, region } of the area tapped in the picture, or of the
    // colour chosen in the list, with no area of its own. Looking at a colour leaves the picture
    // as it is; showing it on its own is the selection above.
    inspected: null,
    // Layer mode (glazing): the picture as coats of a few base paints.
    layers: null, // result of layerImage (raw); null until analysed or without base paints
    layerShown: [], // per layer: shown in the picture
    layerStep: null, // index into layers.steps while the painting order is walked through
    layerStepView: 'paint', // the picture of a step: 'paint' (where to paint), 'wash' (this wash alone), 'result' (the paper so far)
    layerPoint: null, // { x, y } of the clicked spot, in working pixels
    aiPlan: null, // { key, serial, plan, usage, cost, provider, model } of the last answer
    aiDetails: null, // { key, mask, hex, paintId, dilution, pixels, shapes } the final wash of details (raw)
    aiMatch: null, // { key, on, off } distance to the photo with and without the AI's choices, per method
    sketch: null, // { key, paths, width, height } the pencil sketch as lines of points, see lib/sketch.js (raw)
    aiBusy: false,
    aiError: null,
    pictureStamp: 0, // counts the pictures opened
    closeups: [], // [{ id, number, rect, thumb, edits }] parts of the base picture, each analysed as its own picture
    closeupId: null, // the close-up on screen, null for the base picture
    base: null, // { image, pixels, name, savedId, edits } of the base picture while a close-up is on screen (raw)
    pendingEdits: null, // { key, edits } of a picture opened in layer mode, for its first mix analysis
    busy: false,
    error: null,
    settings: {
      mode: 'mix', // mix = colours mixed on the palette; layer = glazes of a few base paints
      layerCount: 5, // layer mode: base paints the app proposes
      layerSimplify: 4, // layer mode: its own "Simplify areas"; every layer has to be painted by hand
      layerAccents: 3, // layer mode: accent layers at most (a strong wash on small areas, painted last)
      maxCoats: 2, // layer mode: coats of one wash an area can get
      colours: 20,
      simplify: SIMPLIFY_ZERO, // shown as 0; see SIMPLIFY_ZERO
      guides: true, // sketch: guide lines for transferring it to paper (quarters and diagonals)
      details: true, // with an AI plan: show the final wash of fine dark details
      ai: false, // the colours to mix and the paints are chosen by an AI model (once asked for this picture)
      geometric: false, // areas as polygons with straight edges that overlap, instead of their organic outline
      maxPaints: 3,
      variety: 5, // 0 = the picture as accurate as possible, 10 = small areas of another hue keep their mix
      values: false, // mix mode: the picture in grey, every value painted with one paint of the box (a value study)
      saturation: 200, // percent, applied to the photo before the analysis
      contrast: 100,
      view: 'mixed', // mixed | target | overlay | original | template
      outlines: true,
      numbers: true,
    },
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    /** The colour of the inspector card and of its full breakdown. */
    inspectedColour: (state) => (state.inspected == null ? null : state.entries[state.inspected.entry] ?? null),
    layerMode: (state) => state.settings.mode === 'layer',
    /** What an AI plan belongs to: the picture as it is analysed. */
    aiKey: (state) => [state.pictureStamp, state.settings.saturation, state.settings.contrast, state.settings.values ? 'values' : ''].join('/'),
    // Value mode belongs to mix mode: layers are fitted to colours.
    valueMode: (state) => !!state.settings.values && state.settings.mode !== 'layer',
    /** What a sketch belongs to: the picture, and the AI's answer for it once there is one. */
    sketchKey(state) {
      return `${state.pictureStamp}/${state.aiPlan?.key === this.aiKey ? state.aiPlan.serial : 0}`
    },
    /** The AI's plan for this picture, when AI is switched on and has been asked. */
    aiActive(state) {
      return state.settings.ai && state.aiPlan?.key === this.aiKey ? state.aiPlan.plan : null
    },
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
     * The number a layer goes by in the interface: painted layers count 1, 2, 3 in painting order,
     * accents A1, A2, A3 on their own, so that "Layers" in the settings matches what is numbered;
     * a paint that got no layer has none (null).
     */
    layerNumbers(state) {
      let n = 0, a = 0
      if (!state.layers) return []
      return state.layers.layers.map((layer) => (layer.top <= 0 ? null : layer.kind === 'accent' ? `A${++a}` : ++n))
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
    /** The paints the AI chose for mixing, or null without a plan. */
    aiPaints() {
      const byId = usePaintsStore().byId
      const chosen = (this.aiActive?.paints ?? []).map((id) => byId[id]).filter(Boolean)
      return chosen.length ? chosen : null
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
    /** Load a sample picture by its place in the list; the first one is used at start. */
    async loadSample(index = 0) {
      const sample = SAMPLES[index] ?? SAMPLES[0]
      await this.loadFromSource(sample.url, `${sample.name} (sample)`)
    },
    async loadFile(file) {
      const url = URL.createObjectURL(file)
      await this.loadFromSource(url, file.name)
    },
    /** Open a picture from the collection with its saved settings and colour changes. */
    async loadSaved(record) {
      // Pictures saved before layer mode existed are mix pictures.
      Object.assign(this.settings, { mode: 'mix', geometric: false, values: false }, record.settings, { ai: false })
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
      return !!this.segmentation && mixKey === mixKeyOf(this.settings, this.aiActive?.mixes.length ? this.aiPlan.serial : 0)
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
        // The close-ups belonged to the picture before.
        this.closeups = []
        this.closeupId = null
        this.base = null
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
     * A part of the base picture as a picture of its own: cut from the photo at its full size, so
     * the analysis finds what the whole picture has no room for. `rect` is in shares of the picture.
     */
    async addCloseup(rect) {
      if (!this.image || !useProStore().require(false, 'zoom in on a part of the picture')) return
      const source = this.base?.image ?? this.image
      const cut = closeupSize(source.naturalWidth ?? source.width, source.naturalHeight ?? source.height, rect, 160 * 160)
      const thumb = document.createElement('canvas')
      thumb.width = cut.width
      thumb.height = cut.height
      thumb.getContext('2d').drawImage(source, cut.sx, cut.sy, cut.sw, cut.sh, 0, 0, cut.width, cut.height)
      const number = this.closeups.reduce((most, c) => Math.max(most, c.number), 0) + 1
      const closeup = { id: `closeup-${number}`, number, rect, thumb: thumb.toDataURL('image/jpeg', 0.8), edits: [] }
      this.closeups.push(closeup)
      await this.openCloseup(closeup.id)
    },
    // The colour changes of the picture on screen go with it, so they are there again on return.
    keepEdits() {
      const edits = this.exportEdits()
      const closeup = this.closeups.find((c) => c.id === this.closeupId)
      if (closeup) closeup.edits = edits
      else if (this.base) this.base.edits = edits
    },
    async openCloseup(id) {
      const closeup = this.closeups.find((c) => c.id === id)
      if (!closeup || id === this.closeupId || !this.image) return
      if (this.closeupId == null) {
        this.base = markRaw({ image: this.image, pixels: this.pixels, name: this.imageName, savedId: this.savedId, edits: [] })
      }
      this.keepEdits()
      const source = this.base.image
      const cut = closeupSize(source.naturalWidth ?? source.width, source.naturalHeight ?? source.height, closeup.rect, WORK_PIXELS)
      const canvas = document.createElement('canvas')
      canvas.width = cut.width
      canvas.height = cut.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, cut.sx, cut.sy, cut.sw, cut.sh, 0, 0, cut.width, cut.height)
      this.closeupId = id
      this.savedId = null
      this.image = markRaw(canvas)
      this.pixels = markRaw({ rgba: ctx.getImageData(0, 0, cut.width, cut.height).data, width: cut.width, height: cut.height })
      this.imageName = `${this.base.name} – detail ${closeup.number}`
      await this.showPicture(closeup.edits)
    },
    async showBase() {
      if (this.closeupId == null || !this.base) return
      this.keepEdits()
      const base = this.base
      this.closeupId = null
      this.base = null
      this.image = base.image
      this.pixels = base.pixels
      this.imageName = base.name
      this.savedId = base.savedId
      await this.showPicture(base.edits)
    },
    // Analyses the picture that was just put in place and brings its colour changes back.
    async showPicture(edits) {
      this.selectedEntry = null
      this.selectedRegion = null
      this.inspected = null
      this.forgetPicture()
      this.pendingEdits = { key: mixKeyOf(this.settings, 0), edits }
      await this.analyse()
    },
    async removeCloseup(id) {
      if (id === this.closeupId) await this.showBase()
      this.closeups = this.closeups.filter((c) => c.id !== id)
    },

    /**
     * A new picture. What the other mode worked out belongs to the picture before and is dropped;
     * the current mode keeps its result on screen until the new one is there.
     */
    forgetPicture() {
      pictureSerial++
      this.pictureStamp = pictureSerial
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
        this.inspected = null
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
      // In value mode the picture is grey, whatever the saturation is set to.
      const rgba = adjustImage(this.pixels.rgba, { saturation: this.valueMode ? 0 : saturation / 100, contrast: contrast / 100 })
      this.adjusted = rgba === this.pixels.rgba ? null : markRaw({ rgba, width, height })
      if (this.aiDetails?.key !== this.aiKey) this.findDetails()
      if (this.layerMode) return this.analyseLayers(rgba, width, height, token)
      // With an AI plan its colours are the mixes; the analysis only assigns the picture to them.
      const plan = this.aiActive
      // The colours of the details are mixes too, so that a small thing keeps its colour.
      const values = this.valueMode
      const anchors = !values && plan?.mixes.length ? [...new Set([...plan.mixes, ...plan.details.filter((d) => d.hex)].map((m) => m.hex))] : undefined
      const focus = plan?.details.length ? plan.details.map((d) => [...d.box]) : undefined
      const key = mixKeyOf(this.settings, anchors ? this.aiPlan.serial : 0)
      try {
        // "Colours" counts mixes. The analysis is asked for more, and planMixes joins them down to
        // the wanted number once the paints are known.
        const { result } = await runSegmentation({
          rgba: rgba.slice(),
          width,
          height,
          // A grey picture is one mix in the eyes of the analysis: it is split into values, and
          // "Colours" still counts the mixes those are painted with (planMixes).
          colours: values ? 1 : mixesToRequest(this.settings.colours),
          maxWashes: values ? VALUE_STEPS : undefined,
          washStep: values ? VALUE_STEP : undefined,
          simplify: this.settings.simplify,
          geometric: this.settings.geometric,
          anchors,
          focus,
        })
        if (token !== analysisToken || this.layerMode) return // a newer analysis superseded this one
        mixKey = key
        this.applySegmentation(result)
        // Colour changes of a picture that was opened in layer mode.
        const pending = this.pendingEdits
        this.pendingEdits = null
        if (pending?.key === key) this.applyEdits(pending.edits)
        this.noteMatch()
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
      // With an AI plan its paints are the layers, in its order; the paint box is left alone.
      const chosen = (this.aiActive?.layers ?? []).filter((id) => paints.byId[id])
      const propose = !chosen.length && box.layerAuto && !(layerProposal === proposalKey && box.layerIds.length)
      const pool = (chosen.length ? chosen.map((id) => paints.byId[id]) : propose ? paints.autoCandidates : paints.layerPaints).map(({ id, hex }) => ({ id, hex }))
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
          count: !chosen.length && box.layerAuto ? this.settings.layerCount : undefined,
          // A plain copy: the worker cannot be sent the reactive array of the store.
          paintIds: chosen.length ? chosen : propose ? undefined : [...box.layerIds],
          maxCoats: this.settings.maxCoats,
          simplify: this.settings.layerSimplify,
          geometric: this.settings.geometric,
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
        this.noteMatch()
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
      this.inspected = null
      this.autoPaints()
      this.recomputeAllRecipes()
    },

    /**
     * Ask the AI model for a plan of this picture: the colours to mix, the paints, the layers.
     * A small copy of the picture and the list of paints go straight from this browser to the
     * provider, with the user's own key; nothing is sent without their consent.
     */
    async askAi() {
      const ai = useAiStore()
      const paints = usePaintsStore()
      if (!this.pixels || this.aiBusy) return
      if (!ai.ready) {
        this.aiError = !ai.agreed ? 'Please agree to the picture being sent first.' : 'An API key is needed.'
        return
      }
      const key = this.aiKey
      const { provider, model } = ai
      // The paints to choose from: the Auto pool, or what the paint box holds.
      const pool = (paints.activeBox.auto ? paints.autoCandidates : paints.enabled).map(({ id, name, hex }) => ({ id, name, hex }))
      this.aiBusy = true
      this.aiError = null
      try {
        const source = this.adjusted ?? this.pixels
        const image = smallCopy(source)
        const size = { width: image.width, height: image.height }
        const request = aiRequest({
          provider,
          model,
          key: ai.key,
          image,
          paints: pool,
          colours: this.settings.colours,
          layers: Math.min(6, this.settings.layerCount + 1),
        })
        const response = await fetch(request.url, request.init)
        const answer = await response.json().catch(() => null)
        if (!response.ok && !answer?.error) throw new Error(`The provider answered with status ${response.status}.`)
        const { plan, usage } = readAiAnswer(provider, answer, pool, { colours: 32, layers: 6, size })
        if (key !== this.aiKey) return // another picture was opened meanwhile
        this.aiPlan = { key, serial: (this.aiPlan?.serial ?? 0) + 1, plan, usage, cost: aiCost(provider, model, usage), provider, model }
        this.settings.ai = true
        this.aiMatch = this.aiMatch?.key === key ? this.aiMatch : null
        this.findDetails()
        this.analyse()
      } catch (e) {
        this.aiError = e instanceof TypeError ? 'Could not reach the provider. Check the connection and the key.' : e.message
      } finally {
        this.aiBusy = false
      }
    },

    /**
     * The final wash: the fine dark shapes inside the boxes the AI named, taken from the picture
     * itself, in the colour its dark paint gives there.
     */
    findDetails() {
      const plan = this.aiPlan?.key === this.aiKey ? this.aiPlan.plan : null
      const source = this.adjusted ?? this.pixels
      this.aiDetails = null
      if (!plan?.details.length || !source) return
      const { width, height } = source
      const lab = toOklabPixels(source.rgba, width * height)
      const wash = detailWash(lab, width, height, boxMask(plan.details.map((d) => d.box), width, height))
      if (!wash.pixels) return
      const paints = usePaintsStore()
      const candidates = paints.activeBox.auto ? paints.autoCandidates : paints.enabled
      // The paint the AI named, or the darkest one at hand.
      const paint = paints.byId[plan.detailPaint] ?? candidates.reduce((x, y) => (hexToOklab(y.hex)[0] < hexToOklab(x.hex)[0] ? y : x), candidates[0])
      if (!paint) return
      const recipe = findRecipes(oklabToHex(wash.lab), [paint], { maxPaints: 1, limit: 1 })[0]
      this.aiDetails = markRaw({
        key: this.aiKey,
        mask: wash.mask,
        width,
        height,
        hex: recipe?.hex ?? paint.hex,
        dilution: recipe?.dilution ?? '',
        paintId: paint.id,
        pixels: wash.pixels,
        shapes: wash.shapes,
      })
    },

    /**
     * The pencil sketch, worked out when it is first shown: the shapes of the photo as it is
     * (a raised saturation would only add noise), outlined like a colouring book; lines inside
     * the main subjects the AI named are firm.
     */
    async ensureSketch() {
      const source = this.pixels
      const key = this.sketchKey
      if (!source || this.sketch?.key === key || sketchRunning === key) return
      sketchRunning = key
      const plan = this.aiPlan?.key === this.aiKey ? this.aiPlan.plan : null
      try {
        const { result } = await runSegmentation({
          kind: 'sketch',
          rgba: source.rgba.slice(),
          width: source.width,
          height: source.height,
          subjects: plan?.subjects.map((s) => [...s.box]),
        })
        if (key !== this.sketchKey) return
        this.sketch = markRaw({ key, ...result })
        this.renderVersion++
      } catch (e) {
        this.error = `Sketch failed: ${e.message}`
      } finally {
        if (sketchRunning === key) sketchRunning = null
      }
    },

    /** Notes how close the picture is to the photo now, with or without the AI's choices. */
    noteMatch() {
      const key = this.aiKey
      let value = null
      if (this.layerMode) value = this.layers?.deltaE.mean ?? null
      else if (this.segmentation && this.regionEntry && this.entries.length) {
        const source = this.adjusted ?? this.pixels
        const { regionMap, width, height } = this.segmentation
        if (source?.width === width && source.height === height) {
          const lab = toOklabPixels(source.rgba, width * height)
          const colours = this.entries.map((e) => hexToOklab(e.recipes[e.chosen]?.hex ?? e.targetHex))
          let sum = 0
          for (let p = 0; p < regionMap.length; p++) {
            const c = colours[this.regionEntry[regionMap[p]]]
            const dL = c[0] - lab[p * 3], da = c[1] - lab[p * 3 + 1], db = c[2] - lab[p * 3 + 2]
            sum += Math.sqrt(dL * dL + da * da + db * db)
          }
          value = (sum / regionMap.length) * 100
        }
      }
      if (value == null) return
      const slot = `${this.settings.mode}-${this.aiActive ? 'on' : 'off'}`
      this.aiMatch = { ...(this.aiMatch?.key === key ? this.aiMatch : { key }), [slot]: value }
    },

    /** AI on or off; the plan of this picture is kept either way. */
    setAi(on) {
      if (this.settings.ai === on) return
      this.settings.ai = on
      if (this.aiPlan?.key === this.aiKey) this.analyse()
    },

    /** While the paint box is on Auto, pick the paints that suit the colours of this picture. */
    autoPaints(force = false) {
      const paints = usePaintsStore()
      if (!this.segmentation || !(force || paints.activeBox.auto)) return
      if (!force && this.aiPaints) return // the AI chose them
      // Every wash is a target: a wash its mix cannot reach needs paints for a mix of its own.
      const targets = this.segmentation.clusters.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
      paints.setEnabled(proposePaints(targets, paints.autoCandidates, { maxPaints: this.settings.maxPaints, values: this.valueMode }), true)
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
      // With an AI plan its paints are mixed with; the paint box is left alone.
      const paints = this.aiPaints ?? usePaintsStore().enabled
      const byId = usePaintsStore().byId
      const total = seg.width * seg.height
      const old = this.entries
      const oldRegionEntry = this.regionEntry

      const values = this.valueMode
      const washOf = (recipe, hex) => (recipe.paints.length ? washRecipe(recipe, hex, byId, { values }) : recipe)
      // Value mode with paints that do not get as dark as the picture (a yellow alone): the values
      // of the picture are spread over what the paints reach, from blank paper for the lightest to
      // the darkest paint for the darkest, so that the picture keeps all its steps instead of
      // ending in one flat dark. Paints that reach the darks leave the values alone.
      let clusters = seg.clusters
      if (values && paints.length) {
        const used = seg.clusters.filter((c) => c.pixelCount).map((c) => hexToOklab(c.hex)[0])
        const light = Math.max(...used), dark = Math.min(...used)
        const reach = valueReach(paints, { maxPaints: this.settings.maxPaints })
        if (reach > dark && light > dark) {
          clusters = seg.clusters.map((c) => {
            const L = hexToOklab(c.hex)[0]
            return { ...c, hex: oklabToHex([1 - ((light - L) * (1 - reach)) / (light - dark), 0, 0]) }
          })
        }
      }
      const groups = planMixes(clusters, paints, {
        maxPaints: this.settings.maxPaints,
        // The AI's colours are the mixes: none of them is joined with another.
        wanted: this.aiActive?.mixes.length ? Math.max(this.settings.colours, this.aiActive.mixes.length) : this.settings.colours,
        variety: this.settings.variety,
        values,
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
            // A value study is painted in finer steps of water.
            item.letter = recipes.length ? washLetter(washOf(recipes[0], item.hex).fullness, values) : ''
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
      if (this.inspected && !this.entries[this.inspected.entry]) this.inspected = null
      this.relabel()
      this.renderVersion++
    },

    /** Recipes of one colour: washes of its mix, or recipes of its own once its colour was changed by hand. */
    recomputeRecipes(index, redraw = true) {
      const store = usePaintsStore()
      const entry = this.entries[index]
      if (entry.overridden) {
        entry.family = `own-${index}`
        entry.recipes = findRecipes(entry.targetHex, store.enabled, { maxPaints: this.settings.maxPaints, limit: 5, values: this.valueMode })
      } else {
        entry.family = `mix-${entry.group}`
        entry.recipes = (this.mixRecipes[entry.group] ?? []).map((r) =>
          r.paints.length ? washRecipe(r, entry.targetHex, store.byId, { values: this.valueMode }) : r,
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
        this.inspected = null
        return
      }
      this.selectedRegion = regionId
      this.selectedEntry = this.regionEntry[regionId]
      this.inspect(regionId)
    },

    selectEntry(index) {
      this.selectedEntry = index
      this.selectedRegion = null
      this.inspectEntry(index)
    },

    /**
     * Look at the colour of one area: the inspector card next to the picture, and the full
     * breakdown it opens. The picture stays as it is, so the area keeps its place in the whole.
     */
    inspect(regionId) {
      this.inspected = regionId == null || !this.regionEntry ? null : { entry: this.regionEntry[regionId], region: regionId }
    },

    /** Look at a colour with no area of its own: the one chosen in the colour list. */
    inspectEntry(index) {
      this.inspected = index == null ? null : { entry: index, region: null }
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
      this.inspected = { entry: id, region: regionId }
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
