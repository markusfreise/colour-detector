import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { adjustImage, hexToOklab, oklabToHex, rgbToHex, deltaE } from '../lib/color.js'
import { mix, mixUrl } from '../lib/mixClient.js'
import { usePaintsStore } from './paints.js'
import { useAccountStore } from './account.js'
import { renderLayers } from '../lib/layers.js'
import { useAiStore } from './ai.js'
import { aiRequest, readAiAnswer, aiCost, aiImageSize } from '../lib/ai.js'
import { boxMask, detailWash } from '../lib/details.js'
import { toOklabPixels, SIMPLIFY_ZERO, mixesToRequest } from '../lib/segment.js'
import { closeupSize } from '../lib/closeup.js'
import { useProStore } from './pro.js'
import { hashOf } from '../lib/picture.js'
import { isWclFile, readWcl } from '../lib/wcl.js'
import { DEFAULT_FORMS, toneOfHex } from '../lib/blocking.js'
import { t } from '../i18n/index.js'

// Working resolution: the picture is scaled down to about this many pixels, whatever its shape.
export const WORK_PIXELS = 800 * 600
// Value mode: the values a grey picture is split into at most, and the least factor of strength
// (log) between two of them.
const VALUE_STEPS = 24
const VALUE_STEP = 0.15

// Recipes count as the same mix when they use the same paints.
const paintKey = (recipe) => recipe.paints.map((p) => p.paintId).sort().join('+')
// Paints as the mixing service knows them: an id and a colour.
const plainPaints = (list) => list.map(({ id, hex }) => ({ id, hex }))
import { SAMPLES } from '../data/samples.js'

export { SAMPLES }

let worker = null
let jobCounter = 0
// Every analysis takes a number; only the latest one may write its result or end `busy`.
let analysisToken = 0
// Layer mode on Auto: the base paints are proposed once per picture and then kept, so that moving
// an unrelated slider does not swap the paints under the painter's hands.
let pictureSerial = 0
let layerProposal = null // "picture/count" the current proposal was made for
// The settings the mix analysis (`segmentation`) was made with, see `mixCurrent`.
let mixKey = null
let sketchRunning = null // the picture a sketch is being worked out for
let blockingRunning = null // the blocking being worked out (its key)
let loadSerial = 0 // counts the pictures asked for, see loadFromSource
let recipeSerial = 0 // every planning of the mixes takes a number; only the latest may write its result
let detailSerial = 0 // the same for the final wash of the AI's details
const mixKeyOf = ({ saturation, contrast, simplify, colours, details, geometric, values }, plan = 0) => [saturation, contrast, simplify, colours, details, !!geometric, plan].join('/') + (values ? '/values' : '')

// The Details slider runs the other way from `variety` in the logic (segment.js, mixes.js): high
// Details = the mixes follow the area, so the large parts of the picture keep the most steps; low
// Details = few mixes on the large parts, and a small area of another hue keeps a mix of its own.
const varietyOf = (details) => 10 - details

/**
 * Settings of a saved picture as the current version reads them. Pictures saved before 2026-10-18
 * have `variety`, the Details slider the other way round.
 */
export function savedSettings(settings = {}) {
  const { variety, ...rest } = settings
  if (rest.details == null && typeof variety === 'number') rest.details = varietyOf(variety)
  return rest
}

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
      if (event.data.error) reject(Object.assign(new Error(event.data.error), { status: event.data.status }))
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
    // The picture as the entitlements know it: a sample, or a photo with the hash of its bytes
    // (null until it is known). Close-ups are part of the picture they are cut from.
    picture: null, // { sample, hash }
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
    mixing: 0, // questions to the mixing service still open (recipes, mixes, Auto)
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
    blocking: null, // { key, ...blockImage } the picture as tones in large masses, see lib/blocking.js (raw)
    blockingSolo: null, // the tone shown on its own in the Blocking view, or null
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
      details: 5, // 10 = the most steps across the picture, 0 = small areas of another hue keep their mix (see varietyOf)
      values: false, // mix mode: the picture in grey, every value painted with one paint of the box (a value study)
      saturation: 200, // percent, applied to the photo before the analysis
      contrast: 100,
      view: 'mixed', // mixed | target | overlay | original | template | blocking (template has no button for now)
      // Blocking: light and shadow in large masses (lib/blocking.js).
      blockingTones: 2, // 2 = light and shadow, 3 = with a middle tone
      blockingSplit: null, // thresholds in L* set by hand; null = where the photo divides
      blockingForms: DEFAULT_FORMS, // 0 = more detail .. 10 = the largest masses
      blockingOpacity: 100, // percent: the tones over the photo, 100 = the photo is not seen
      outlines: true,
      numbers: true, // false = none, true = the numbers alone, 'backdrop' = each on a padded square
      numberSize: 'normal', // normal | large (1.4 times)
      grid: false, // false = none, else the colour of its lines: 'white' | 'grey' | 'black'
      gridColumns: 8, // the picture's width in that many square cells; rows as many as fit the height
    },
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    /** The colour of the inspector card and of its full breakdown. */
    inspectedColour: (state) => (state.inspected == null ? null : state.entries[state.inspected.entry] ?? null),
    layerMode: (state) => state.settings.mode === 'layer',
    /** What an AI plan belongs to: the picture as it is analysed. */
    aiKey: (state) => [state.pictureStamp, state.settings.saturation, state.settings.contrast, state.settings.values ? 'values' : ''].join('/'),
    // Monochrome (setting `values`) belongs to mix mode: layers are fitted to colours. It is a Pro
    // feature, so a picture saved with it opens in colour without Pro.
    valueMode: (state) => !!state.settings.values && state.settings.mode !== 'layer' && useProStore().can('monochrome'),
    /** What a blocking belongs to: the picture as analysed and the settings of the view. */
    blockingKey(state) {
      const s = state.settings
      const source = state.adjusted ?? state.pixels
      return [state.pictureStamp, source?.width, source?.height, s.saturation, s.contrast, s.blockingTones, s.blockingSplit?.join(',') ?? '', s.blockingForms].join('/')
    },
    /** The blocking of the picture on screen as it is set, or null while it is worked out. */
    blockingResult(state) {
      return state.blocking?.key === this.blockingKey ? state.blocking : null
    },
    /**
     * How a mix stands to its tone in the blocking: 'lighter' or 'darker' when the mixed colour
     * falls in another tone than the colour of the photo, else null. Value matters more than hue.
     */
    toneWarning() {
      const thresholds = this.blockingResult?.thresholds
      return (entry) => {
        const mixed = entry?.recipes[entry.chosen]?.hex
        if (!thresholds || !mixed) return null
        const want = toneOfHex(entry.targetHex, thresholds)
        const got = toneOfHex(mixed, thresholds)
        return got === want ? null : got < want ? 'lighter' : 'darker'
      }
    },
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
      // A split of light and shadow set by hand belongs to the photo it was set for.
      this.settings.blockingSplit = null
      await this.loadFromSource(sample.url, t('{name} (sample)', { name: t(sample.name) }), { sample: true, hash: null })
    },
    async loadFile(file) {
      // A picture file (.wcl) opens as it was saved; it joins the collection when it is saved there.
      if (isWclFile(file)) {
        try {
          const record = await readWcl(file)
          await this.loadSaved({ ...record, id: null })
        } catch (e) {
          this.error = t('Could not open the picture: {reason}', { reason: t(e.message) })
        }
        return
      }
      const url = URL.createObjectURL(file)
      // The bytes of the photo as they came: the same file is the same picture, whenever it is opened.
      const hash = await hashOf(file).catch(() => null)
      this.settings.blockingSplit = null
      await this.loadFromSource(url, file.name, { sample: false, hash })
    },
    /** Open a picture from the collection with its saved settings and colour changes. */
    async loadSaved(record) {
      // Pictures saved before layer mode existed are mix pictures.
      Object.assign(this.settings, { mode: 'mix', geometric: false, values: false }, savedSettings(record.settings), { ai: false })
      // The palette belongs to the picture. Pictures saved before it did keep the one on screen.
      if (record.palette) usePaintsStore().setPalette(record.palette)
      const url = URL.createObjectURL(record.blob)
      // Pictures saved before they knew their photo take the hash of the stored copy, which stays the same.
      const picture = record.picture?.hash || record.picture?.sample ? record.picture : { sample: false, hash: await hashOf(record.blob).catch(() => null) }
      await this.loadFromSource(url, record.name, picture)
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
    async loadFromSource(src, name, picture = { sample: false, hash: null }) {
      this.error = null
      this.savedId = null
      // Pictures asked for one after the other: the last one asked for wins, whichever loads first.
      const serial = ++loadSerial
      try {
        const img = await loadImage(src)
        if (serial !== loadSerial) return
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
        this.picture = picture
        this.forgetPicture()
        await this.analyse()
      } catch (e) {
        this.error = t('Could not load image: {reason}', { reason: t(e.message) })
      }
    },

    /**
     * A part of the base picture as a picture of its own: cut from the photo at its full size, so
     * the analysis finds what the whole picture has no room for. `rect` is in shares of the picture.
     */
    async addCloseup(rect) {
      if (!this.image || !useProStore().require('closeups', 'zoom in on a part of the picture')) return
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
      this.imageName = t('{name} – detail {n}', { name: this.base.name, n: closeup.number })
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
     * No picture at all, and nothing still on its way: what the showcase behind signing in leaves
     * when it ends, since its colours name paints that are gone with it.
     */
    clearPicture() {
      loadSerial++
      analysisToken++
      Object.assign(this, {
        image: null,
        pixels: null,
        adjusted: null,
        segmentation: null,
        entries: [],
        order: [],
        baseEntries: 0,
        regionEntry: null,
        mixRecipes: {},
        selectedEntry: null,
        selectedRegion: null,
        inspected: null,
        layers: null,
        layerShown: [],
        busy: false,
      })
      this.renderVersion++
    },

    /**
     * A new picture. What the other mode worked out belongs to the picture before and is dropped;
     * the current mode keeps its result on screen until the new one is there.
     */
    forgetPicture() {
      pictureSerial++
      this.pictureStamp = pictureSerial
      this.blockingSolo = null
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
        // "Colours" counts mixes. The analysis is asked for more, and the mixing service joins them
        // down to the wanted number once the paints are known.
        const { result } = await runSegmentation({
          rgba: rgba.slice(),
          width,
          height,
          // A grey picture is one mix in the eyes of the analysis: it is split into values, and
          // "Colours" still counts the mixes those are painted with.
          colours: values ? 1 : mixesToRequest(this.settings.colours),
          maxWashes: values ? VALUE_STEPS : undefined,
          washStep: values ? VALUE_STEP : undefined,
          simplify: this.settings.simplify,
          // Details weighs small colours and lightness in the analysis too, not only when mixes
          // are joined: a grey picture has no hues to keep.
          variety: values ? undefined : varietyOf(this.settings.details),
          geometric: this.settings.geometric,
          anchors,
          focus,
        })
        if (token !== analysisToken || this.layerMode) return // a newer analysis superseded this one
        mixKey = key
        await this.applySegmentation(result)
        if (token !== analysisToken || this.layerMode) return
        // Colour changes of a picture that was opened in layer mode.
        const pending = this.pendingEdits
        this.pendingEdits = null
        if (pending?.key === key) this.applyEdits(pending.edits)
        this.noteMatch()
      } catch (e) {
        if (token === analysisToken) this.failed('Analysis failed: {reason}', e)
      } finally {
        // A superseded analysis leaves `busy` to the one that is still running.
        if (token === analysisToken) this.busy = false
      }
    },

    /**
     * Layer mode: glazes of the base paints. On Auto the app proposes the paints from the paint
     * palette's Auto pool, otherwise the ones chosen in the paint box are fitted.
     */
    async analyseLayers(rgba, width, height, token = ++analysisToken) {
      const paints = usePaintsStore()
      const palette = paints.palette
      const { layerCount, maxCoats, layerAccents } = this.settings
      const proposalKey = [pictureSerial, layerCount, maxCoats, layerAccents].join('/')
      // Propose only when there is nothing to keep: a new picture, another number of layers or
      // coats or accents (the best paints depend on those), or Auto pressed.
      // With an AI plan its paints are the layers, in its order; the paint box is left alone.
      const chosen = (this.aiActive?.layers ?? []).filter((id) => paints.byId[id])
      const propose = !chosen.length && palette.layerAuto && !(layerProposal === proposalKey && palette.layerIds.length)
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
          count: !chosen.length && palette.layerAuto ? this.settings.layerCount : undefined,
          // A plain copy: the worker cannot be sent the reactive array of the store.
          paintIds: chosen.length ? chosen : propose ? undefined : [...palette.layerIds],
          maxCoats: this.settings.maxCoats,
          simplify: this.settings.layerSimplify,
          geometric: this.settings.geometric,
          accents: this.settings.layerAccents,
          planUrl: mixUrl('layers'),
        })
        if (token !== analysisToken || !this.layerMode) return // superseded
        // The proposal goes to the palette it was made for, also when another picture was opened meanwhile.
        if (propose) {
          paints.setLayerPaints(result.paintIds, true, palette)
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
        if (token === analysisToken) this.failed('Analysis failed: {reason}', e)
      } finally {
        if (token === analysisToken) this.busy = false
      }
    },

    /** Layer mode: let the app choose the base paints for this picture (again). */
    proposeLayers() {
      layerProposal = null
      const paints = usePaintsStore()
      paints.setLayerPaints(paints.palette.layerIds, true)
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
        return this.recomputeAllRecipes()
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

    async applySegmentation(result) {
      this.segmentation = markRaw(result)
      this.entries = []
      this.baseEntries = 0
      this.regionEntry = null
      this.selectedEntry = null
      this.selectedRegion = null
      this.inspected = null
      await this.refreshMixes()
    },

    /** On Auto the paints for the picture first, then the mixes and their recipes. */
    async refreshMixes() {
      await this.autoPaints()
      await this.recomputeAllRecipes()
    },

    /**
     * What went wrong, in words. A session that has ended shows the sign-in again; a picture is
     * never sent anywhere, only its colours, so the message names the mixing.
     */
    failed(text, error) {
      if (error?.status === 401) useAccountStore().refresh()
      this.error = t(text, { reason: t(error?.message ?? String(error)) })
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
      const pool = (paints.palette.auto ? paints.autoCandidates : paints.enabled).map(({ id, name, hex }) => ({ id, name, hex }))
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
    async findDetails() {
      const serial = ++detailSerial
      const plan = this.aiPlan?.key === this.aiKey ? this.aiPlan.plan : null
      const source = this.adjusted ?? this.pixels
      this.aiDetails = null
      if (!plan?.details.length || !source) return
      const { width, height } = source
      const lab = toOklabPixels(source.rgba, width * height)
      const wash = detailWash(lab, width, height, boxMask(plan.details.map((d) => d.box), width, height))
      if (!wash.pixels) return
      const paints = usePaintsStore()
      const candidates = paints.palette.auto ? paints.autoCandidates : paints.enabled
      // The paint the AI named, or the darkest one at hand.
      const paint = paints.byId[plan.detailPaint] ?? candidates.reduce((x, y) => (hexToOklab(y.hex)[0] < hexToOklab(x.hex)[0] ? y : x), candidates[0])
      if (!paint) return
      const key = this.aiKey
      let recipe
      try {
        const { results } = await mix('recipes', { paints: plainPaints([paint]), jobs: [{ hex: oklabToHex(wash.lab), maxPaints: 1, limit: 1 }] })
        recipe = results[0][0]
      } catch (e) {
        this.failed('Mixing failed: {reason}', e)
      }
      if (serial !== detailSerial) return // asked again meanwhile
      this.aiDetails = markRaw({
        key,
        mask: wash.mask,
        width,
        height,
        hex: recipe?.hex ?? paint.hex,
        dilution: recipe?.dilution ?? '',
        paintId: paint.id,
        pixels: wash.pixels,
        shapes: wash.shapes,
      })
      this.renderVersion++
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
        this.error = t('Sketch failed: {reason}', { reason: t(e.message) })
      } finally {
        if (sketchRunning === key) sketchRunning = null
      }
    },

    /** Works out the blocking of the picture as it is set (in the worker), unless it is there or on its way. */
    async ensureBlocking() {
      const source = this.adjusted ?? this.pixels
      const key = this.blockingKey
      if (!source || this.blocking?.key === key || blockingRunning === key) return
      blockingRunning = key
      const { blockingTones: tones, blockingSplit: split, blockingForms: forms } = this.settings
      try {
        const { result } = await runSegmentation({ kind: 'blocking', rgba: source.rgba.slice(), width: source.width, height: source.height, tones, split: split ? [...split] : null, forms })
        if (key !== this.blockingKey) return
        // A tone on its own that the new blocking does not have any more is let go.
        if (this.blockingSolo != null && this.blockingSolo >= result.tones) this.blockingSolo = null
        this.blocking = markRaw({ key, ...result })
        this.renderVersion++
      } catch (e) {
        this.error = t('Blocking failed: {reason}', { reason: t(e.message) })
      } finally {
        if (blockingRunning === key) blockingRunning = null
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
    async autoPaints(force = false) {
      const paints = usePaintsStore()
      const segmentation = this.segmentation
      if (!segmentation || !(force || paints.palette.auto)) return
      if (!force && this.aiPaints) return // the AI chose them
      // Every wash is a target: a wash its mix cannot reach needs paints for a mix of its own.
      const targets = segmentation.clusters.filter((c) => c.pixelCount).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
      this.mixing++
      try {
        const { paintIds } = await mix('propose', { targets, paints: plainPaints(paints.autoCandidates), maxPaints: this.settings.maxPaints, values: this.valueMode })
        // A newer picture or analysis proposes for itself.
        if (segmentation === this.segmentation) paints.setEnabled(paintIds, true)
      } catch (e) {
        if (segmentation === this.segmentation) this.failed('Mixing failed: {reason}', e)
      } finally {
        this.mixing--
      }
    },

    /**
     * Build the colours and their recipes from the analysis and the paint box.
     *
     * The analysis delivers mixes, each split into washes. The mixing service joins them into the
     * wanted number of mixes and gives every mix its recipes, fitted to its largest wash; every
     * other wash is that recipe with more or less water. Washes that end up on the same water
     * level are the same instruction for the painter, so they come back as one colour.
     * Colours changed by hand, detached areas and picked recipes are carried over where they still fit.
     */
    async recomputeAllRecipes() {
      // Layer mode has no recipes: a changed paint box means the layers are planned again.
      if (this.layerMode) return this.analyse()
      const seg = this.segmentation
      if (!seg) return
      const serial = ++recipeSerial
      const store = usePaintsStore()
      // With an AI plan its paints are mixed with; the paint box is left alone.
      const paints = this.aiPaints ?? store.enabled
      const enabled = store.enabled
      const values = this.valueMode
      const { maxPaints } = this.settings
      this.mixing++
      try {
        const { mixes } = await mix('plan', {
          clusters: seg.clusters.map(({ index, group, hex, pixelCount }) => ({ index, group, hex, pixelCount })),
          paints: plainPaints(paints),
          maxPaints,
          // The AI's colours are the mixes: none of them is joined with another.
          wanted: this.aiActive?.mixes.length ? Math.max(this.settings.colours, this.aiActive.mixes.length) : this.settings.colours,
          variety: varietyOf(this.settings.details),
          values,
        })
        if (serial !== recipeSerial || seg !== this.segmentation) return // superseded
        const total = seg.width * seg.height
        const old = this.entries
        const oldRegionEntry = this.regionEntry

        const mixRecipes = {}
        const built = []
        for (const { group, recipes, items } of mixes) {
          mixRecipes[group] = recipes
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
            recipes: item.washes,
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

        // Colours changed by hand get recipes of their own, detached areas the washes of their mix.
        const jobs = []
        const waiting = []
        entries.forEach((entry, i) => {
          entry.family = entry.overridden ? `own-${i}` : `mix-${entry.group}`
          if (!entry.overridden && i < baseEntries) return
          waiting.push(entry)
          jobs.push(this.recipeJob(entry, mixRecipes, enabled))
        })
        if (jobs.length) {
          const { results } = await mix('recipes', { paints: plainPaints(this.paintsFor(jobs, enabled)), jobs })
          if (serial !== recipeSerial || seg !== this.segmentation) return
          waiting.forEach((entry, n) => (entry.recipes = results[n]))
        }

        this.mixRecipes = markRaw(mixRecipes)
        this.entries = entries
        this.baseEntries = baseEntries
        this.regionEntry = markRaw(regionEntry)
        this.entries.forEach((entry) => {
          entry.chosen = 0
          const wanted = entry.overridden ? entry.kept : pickedPaints[entry.group]
          if (wanted) entry.chosen = Math.max(0, entry.recipes.findIndex((r) => paintKey(r) === wanted))
          delete entry.kept
        })
        if (this.selectedEntry != null && !this.entries[this.selectedEntry]) this.selectedEntry = null
        if (this.inspected && !this.entries[this.inspected.entry]) this.inspected = null
        this.relabel()
        this.renderVersion++
      } catch (e) {
        if (serial === recipeSerial) this.failed('Mixing failed: {reason}', e)
      } finally {
        this.mixing--
      }
    },

    /**
     * The question for the recipes of one colour: recipes of its own once its colour was changed
     * by hand (from the paint box, also while an AI plan is on), otherwise the washes of its mix.
     */
    recipeJob(entry, mixRecipes = this.mixRecipes, enabled = usePaintsStore().enabled) {
      const values = this.valueMode
      if (entry.overridden) return { hex: entry.targetHex, maxPaints: this.settings.maxPaints, limit: 5, values, only: enabled.map((p) => p.id) }
      return { hex: entry.targetHex, wash: mixRecipes[entry.group] ?? [], values }
    },

    // The paints the jobs name: the paint box and the paints of the recipes to dilute.
    paintsFor(jobs, enabled) {
      const byId = usePaintsStore().byId
      const ids = new Set(enabled.map((p) => p.id))
      for (const job of jobs) for (const recipe of job.wash ?? []) for (const p of recipe.paints) ids.add(p.paintId)
      return [...ids].map((id) => byId[id]).filter(Boolean)
    },

    /** Recipes of one colour, after its colour was changed by hand or set back. */
    async recomputeRecipes(index) {
      const entry = this.entries[index]
      if (!entry) return
      entry.family = entry.overridden ? `own-${index}` : `mix-${entry.group}`
      const job = this.recipeJob(entry)
      const asked = `${entry.targetHex}/${entry.overridden}`
      this.mixing++
      try {
        const { results } = await mix('recipes', { paints: plainPaints(this.paintsFor([job], usePaintsStore().enabled)), jobs: [job] })
        // The colour was changed again, or the mixes planned anew, meanwhile.
        if (this.entries[index] !== entry || `${entry.targetHex}/${entry.overridden}` !== asked) return
        entry.recipes = results[0]
        entry.chosen = 0
        this.relabel()
        this.renderVersion++
      } catch (e) {
        this.failed('Mixing failed: {reason}', e)
      } finally {
        this.mixing--
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
      return this.recomputeRecipes(index)
    },

    resetTarget(index) {
      return this.setTarget(index, this.entries[index].sourceHex)
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
