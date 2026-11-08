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
import { toOklabPixels, SIMPLIFY_ZERO, FINEST } from '../lib/segment.js'
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
// Sample pictures, offered in the sample library (SampleDialog.vue); the first one loads at start.
// All are under the Unsplash License, no longer than 1024 px. `credit` names the photographer and
// links to the photo, or to the profile until the photo is up there.
const MARKUS = { name: 'Markus Freise', url: 'https://unsplash.com/@markusfreise' }
export const SAMPLES = [
  { file: 'sample-bielefeld.webp', name: 'Bielefeld', credit: MARKUS },
  { file: 'sample-llyn-idwal.webp', name: 'Llyn Idwal', credit: MARKUS },
  { file: 'sample-rooftops-dusk.webp', name: 'Rooftops at dusk', credit: MARKUS },
  { file: 'sample-winter-fields.webp', name: 'Winter fields', credit: MARKUS },
  { file: 'sample-old-town-snow.webp', name: 'Old town in snow', credit: MARKUS },
  {
    file: 'sample-red-train.webp',
    name: 'Red train',
    credit: { name: 'Markus Freise', url: 'https://unsplash.com/photos/red-and-white-train-on-train-station-Zi8T2OwJf44' },
  },
  {
    file: 'sample-woman-white-wall.webp',
    name: 'Woman by a white wall',
    credit: { name: 'Ayo Ogunseinde', url: 'https://unsplash.com/photos/woman-looking-sideways-leaning-on-white-wall-6W4F62sN_yI' },
  },
].map((sample) => ({ url: `${import.meta.env.BASE_URL}${sample.file}`, name: sample.name, credit: sample.credit, local: false }))
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
// The palette belongs to the whole picture: while a close-up is on screen, what the palette was
// built from waits in `base`, and `segmentation` and `regionEntry` are the close-up's.
//
// The palette (`palette`) is found once, at the finest Simplify (FINEST, shown as -2), and kept while only Simplify or
// Geometric change: those settings change the areas (`segmentation`), which are then assigned to
// the colours of the palette, as a close-up is. So the colours to mix stay the same whatever the
// areas look like; only the settings in `paletteKeyOf` and the paint box change them.
const paletteOf = (state) => state.base ?? state

// Layer mode on Auto: the base paints are proposed once per picture and then kept, so that moving
// an unrelated slider does not swap the paints under the painter's hands.
let pictureSerial = 0
let layerProposal = null // "picture/count" the current proposal was made for
// The settings the palette was found with, and those the areas of the whole picture (or of the
// close-up on screen) were made with; see `paletteCurrent` and `mixCurrent`.
let paletteKey = null
let areaKey = null
let closeupAreaKey = null
let sketchRunning = null // the picture a sketch is being worked out for
let blockingRunning = null // the blocking being worked out (its key)
let loadSerial = 0 // counts the pictures asked for, see loadFromSource
const paletteKeyOf = ({ saturation, contrast, colours, details, values }, plan = 0) => [saturation, contrast, colours, details, plan].join('/') + (values ? '/values' : '')
const areaKeyOf = ({ simplify, geometric }) => `${simplify}/${!!geometric}`

// The Details slider is `variety` in the logic (segment.js, mixes.js): high Details = a small area
// of another hue (a highlight, a red flower in the green) keeps a mix of its own; low Details = the
// mixes follow the area, so the large parts of the picture get the most steps. Until 2026-11-08 the
// slider ran the other way.
const varietyOf = (details) => details

// The white of the paper: an entry of every palette, on top of "Colours", painted with nothing.
const PAPER_HEX = '#ffffff'
const paperRecipe = (targetHex) => ({ paints: [], parts: [], strength: 0, fullness: 0, dilution: 'paper only', hex: PAPER_HEX, deltaE: deltaE(hexToOklab(PAPER_HEX), hexToOklab(targetHex)) })

/** The colours of a palette as `fixed` for the segmentation: the areas are only assigned to them. */
const fixedOf = (palette) =>
  palette.clusters.filter((c) => c.pixelCount || c.paper).map(({ index, hex, group, level, paper, pixelCount }) => ({ index, hex: paper && !pixelCount ? PAPER_HEX : hex, group, level, paper }))

/** A segmentation against `fixed`, its areas pointing at the clusters of the palette. */
function onPalette(result, fixed) {
  for (const region of result.regions) region.cluster = fixed[region.cluster].index
  return result
}

/** The settings a new visitor starts with; a restore link carries only what differs from them. */
export const defaultSettings = () => ({
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
  saturation: 100, // percent, applied to the photo before the analysis
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
})

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
    // The picture as the entitlements know it: a sample, or a photo with the hash of its bytes
    // (null until it is known). Close-ups are part of the picture they are cut from.
    picture: null, // { sample, hash }
    image: null, // HTMLImageElement (raw)
    pixels: null, // { rgba, width, height } at working resolution (raw)
    adjusted: null, // the same pixels with saturation and contrast applied, null when both are at 100 (raw)
    palette: null, // raw result from worker: the colours of the whole picture at Simplify FINEST
    segmentation: null, // raw result from worker: the areas on screen, their clusters those of `palette`
    entries: [], // palette entries
    order: [], // entry indices in the order of their labels (mix by mix, lightest wash first)
    baseEntries: 0, // entries that came from the analysis (detached areas are appended after them)
    regionEntry: null, // Int32Array region -> entry index (raw)
    clusterEntry: null, // Map cluster -> entry index (raw), what a close-up is coloured with
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
    blocking: null, // { key, ...blockImage } the picture as tones in large masses, see lib/blocking.js (raw)
    blockingSolo: null, // the tone shown on its own in the Blocking view, or null
    aiBusy: false,
    aiError: null,
    pictureStamp: 0, // counts the pictures shown, close-ups too
    planStamp: 0, // the picture the palette and an AI plan belong to: a close-up does not change it
    closeups: [], // [{ id, number, rect, thumb }] parts of the base picture, in its colours at a finer scale
    closeupId: null, // the close-up on screen, null for the base picture
    base: null, // { image, pixels, name, savedId, palette, segmentation, regionEntry, clusterEntry } of the base picture while a close-up is on screen (raw)
    pendingEdits: null, // { key, edits } of a picture opened in layer mode, for its first mix analysis
    busy: false,
    error: null,
    settings: defaultSettings(),
  }),
  getters: {
    selected: (state) => (state.selectedEntry == null ? null : state.entries[state.selectedEntry]),
    /** The colour of the inspector card and of its full breakdown. */
    inspectedColour: (state) => (state.inspected == null ? null : state.entries[state.inspected.entry] ?? null),
    layerMode: (state) => state.settings.mode === 'layer',
    /** What an AI plan belongs to: the picture as it is analysed. */
    aiKey: (state) => [state.planStamp, state.settings.saturation, state.settings.contrast, state.settings.values ? 'values' : ''].join('/'),
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
    mixCount: (state) => new Set(state.entries.filter((e) => !(e.paper && !e.overridden)).map((e) => e.family)).size,
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
    /**
     * The settings and paints of a restore link (the QR code of a printed sheet, lib/restoreLink.js)
     * over what is on screen. Paints of one's own that this device does not know are added to it.
     */
    async applyRestore({ settings, palette }) {
      Object.assign(this.settings, defaultSettings(), savedSettings(settings), { ai: false, blockingSplit: null })
      const paints = usePaintsStore()
      const ids = (list) =>
        list
          .map((p) => (typeof p === 'string' ? p : paints.paintFor({ vendor: p[0], number: p[1], name: p[2], hex: p[3] })))
          .filter((id) => paints.byId[id])
      const current = paints.palette
      paints.setPalette({
        ...current,
        auto: palette.auto,
        paintIds: palette.paints ? ids(palette.paints) : current.paintIds,
        layerAuto: palette.layerAuto,
        layerIds: palette.layerPaints ? ids(palette.layerPaints) : current.layerIds,
        autoOff: palette.autoOff,
      })
      if (this.image) await this.analyse()
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
      if (this.layerMode) this.pendingEdits = { key: paletteKeyOf(this.settings), edits: record.edits ?? [] }
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
    /** Whether the palette belongs to the picture and the settings as they are now. */
    paletteCurrent() {
      return !!paletteOf(this).palette && paletteKey === paletteKeyOf(this.settings, this.aiActive?.mixes.length ? this.aiPlan.serial : 0)
    },
    /** Whether the palette and the areas on screen belong to the picture and the settings as they are now. */
    mixCurrent() {
      if (!this.paletteCurrent() || !this.segmentation) return false
      return (this.base ? closeupAreaKey : areaKey) === areaKeyOf(this.settings)
    },
    /** Colour changes worth saving. Detached areas are not kept: they depend on the exact area ids. */
    exportEdits() {
      // In layer mode the mixes can be those of other settings: then the saved changes are kept as they were.
      if (!this.paletteCurrent()) return this.pendingEdits?.edits ?? []
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
     * A closer look at a part of the base picture: cut from the photo at its full size, so its
     * areas are finer, and painted in the palette of the whole picture, which stays as it is.
     * `rect` is in shares of the picture.
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
      const closeup = { id: `closeup-${number}`, number, rect, thumb: thumb.toDataURL('image/jpeg', 0.8) }
      this.closeups.push(closeup)
      await this.openCloseup(closeup.id)
    },
    async openCloseup(id) {
      const closeup = this.closeups.find((c) => c.id === id)
      if (!closeup || id === this.closeupId || !this.image) return
      if (this.closeupId == null) {
        const { image, pixels, imageName: name, savedId, palette, segmentation, regionEntry, clusterEntry } = this
        this.base = markRaw({ image, pixels, name, savedId, palette, segmentation, regionEntry, clusterEntry })
      }
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
      this.newView()
      // Only what is missing is worked out: in mix mode with a palette at hand, that is the areas.
      closeupAreaKey = null
      if (this.layerMode || !this.paletteCurrent()) await this.analyse()
      else await this.assignCloseup()
    },
    async showBase() {
      if (this.closeupId == null || !this.base) return
      const base = this.base
      this.closeupId = null
      this.base = null
      this.image = base.image
      this.pixels = base.pixels
      this.imageName = base.name
      this.savedId = base.savedId
      this.palette = base.palette
      this.segmentation = base.segmentation
      this.regionEntry = base.regionEntry
      this.clusterEntry = base.clusterEntry
      this.newView()
      // What was still being worked out for the close-up.
      analysisToken++
      this.busy = false
      if (this.layerMode || !this.mixCurrent()) return this.analyse()
      this.adjustPicture()
      if (this.aiDetails?.key !== this.aiKey) this.findDetails()
      this.renderVersion++
    },
    /** Another view of the same picture: the palette stays, what was picked on the view before goes. */
    newView() {
      this.selectedEntry = null
      this.selectedRegion = null
      this.inspected = null
      this.blockingSolo = null
      this.pictureStamp = ++pictureSerial
    },
    async removeCloseup(id) {
      if (id === this.closeupId) await this.showBase()
      this.closeups = this.closeups.filter((c) => c.id !== id)
    },

    /** The areas of the close-up on screen, each in the colour of the palette closest to it. */
    async assignCloseup() {
      if (!this.base?.palette || !this.base.clusterEntry) return
      const token = ++analysisToken
      const { palette, clusterEntry } = this.base
      const colours = fixedOf(palette).filter((c) => clusterEntry.has(c.index))
      const areas = areaKeyOf(this.settings)
      const { rgba, width, height } = this.adjustPicture()
      this.busy = true
      this.error = null
      try {
        const { result } = await runSegmentation({
          rgba: rgba.slice(),
          width,
          height,
          simplify: this.settings.simplify,
          variety: this.valueMode ? undefined : varietyOf(this.settings.details),
          geometric: this.settings.geometric,
          fixed: colours,
        })
        if (token !== analysisToken || this.layerMode) return // superseded
        this.segmentation = markRaw(onPalette(result, colours))
        this.regionEntry = markRaw(Int32Array.from(result.regions, (r) => clusterEntry.get(r.cluster)))
        closeupAreaKey = areas
        this.selectedRegion = null
        if (this.inspected?.region != null) this.inspected = null
        this.renderVersion++
      } catch (e) {
        if (token === analysisToken) this.error = t('Analysis failed: {reason}', { reason: t(e.message) })
      } finally {
        if (token === analysisToken) this.busy = false
      }
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
        palette: null,
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
      this.pictureStamp = this.planStamp = ++pictureSerial
      this.blockingSolo = null
      paletteKey = areaKey = closeupAreaKey = null
      this.pendingEdits = null
      if (this.layerMode) {
        this.palette = null
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

    /** The picture on screen with saturation and contrast applied, kept as `adjusted`. */
    adjustPicture() {
      const { width, height } = this.pixels
      const rgba = this.adjustedRgba(this.pixels)
      this.adjusted = rgba === this.pixels.rgba ? null : markRaw({ rgba, width, height })
      return { rgba, width, height }
    },
    adjustedRgba({ rgba }) {
      const { saturation, contrast } = this.settings
      // In value mode the picture is grey, whatever the saturation is set to.
      return adjustImage(rgba, { saturation: this.valueMode ? 0 : saturation / 100, contrast: contrast / 100 })
    },

    async analyse() {
      if (!this.pixels) return
      const token = ++analysisToken
      this.busy = true
      this.error = null
      const shown = this.adjustPicture()
      if (!this.base && this.aiDetails?.key !== this.aiKey) this.findDetails()
      if (this.layerMode) return this.analyseLayers(shown.rgba, shown.width, shown.height, token)
      // The palette comes from the whole picture, also when a close-up is on screen.
      const whole = paletteOf(this)
      const { width, height } = this.base?.pixels ?? shown
      const rgba = this.base ? this.adjustedRgba(this.base.pixels) : shown.rgba
      // With an AI plan its colours are the mixes; the analysis only assigns the picture to them.
      const plan = this.aiActive
      // The colours of the details are mixes too, so that a small thing keeps its colour.
      const values = this.valueMode
      const anchors = !values && plan?.mixes.length ? [...new Set([...plan.mixes, ...plan.details.filter((d) => d.hex)].map((m) => m.hex))] : undefined
      const focus = plan?.details.length ? plan.details.map((d) => [...d.box]) : undefined
      const key = paletteKeyOf(this.settings, anchors ? this.aiPlan.serial : 0)
      const areas = areaKeyOf(this.settings)
      const variety = values ? undefined : varietyOf(this.settings.details)
      try {
        let fresh = false
        if (key !== paletteKey || !whole.palette) {
          // The palette: found at the finest Simplify (FINEST) with its own areas, whatever Simplify is
          // set to. "Colours" counts mixes. The analysis is asked for more, and planMixes joins
          // them down to the wanted number once the paints are known.
          const { result } = await runSegmentation({
            rgba: rgba.slice(),
            width,
            height,
            // A grey picture is one mix in the eyes of the analysis: it is split into values, and
            // "Colours" still counts the mixes those are painted with (planMixes).
            colours: values ? 1 : mixesToRequest(this.settings.colours),
            maxWashes: values ? VALUE_STEPS : undefined,
            washStep: values ? VALUE_STEP : undefined,
            simplify: FINEST,
            geometric: false,
            // Details weighs small colours and lightness in the analysis too, not only when mixes
            // are joined: a grey picture has no hues to keep.
            variety,
            anchors,
            focus,
            paper: true,
          })
          if (token !== analysisToken || this.layerMode) return // a newer analysis superseded this one
          whole.palette = markRaw(result)
          paletteKey = key
          areaKey = closeupAreaKey = null
          fresh = true
        }
        const areasChanged = this.base ? closeupAreaKey !== areas : areaKey !== areas || !whole.segmentation
        if (!this.base && areasChanged) {
          // The areas at the Simplify and Geometric set, in the colours of the palette.
          let seg = whole.palette
          if (this.settings.simplify !== FINEST || this.settings.geometric) {
            const fixed = fixedOf(whole.palette)
            const { result } = await runSegmentation({ rgba: rgba.slice(), width, height, simplify: this.settings.simplify, variety, geometric: this.settings.geometric, focus, fixed })
            if (token !== analysisToken || this.layerMode) return
            seg = onPalette(result, fixed)
          }
          whole.segmentation = markRaw(seg)
          areaKey = areas
        }
        if (fresh) {
          this.applySegmentation()
          // Colour changes of a picture that was opened in layer mode.
          const pending = this.pendingEdits
          this.pendingEdits = null
          if (pending?.key === key) this.applyEdits(pending.edits)
        } else if (areasChanged) {
          if (this.base) await this.assignCloseup()
          else this.mapAreas()
        } else {
          // Nothing of the analysis changed: the paint box or Max paints did.
          this.recomputeAllRecipes()
        }
        this.noteMatch()
      } catch (e) {
        if (token === analysisToken) this.error = t('Analysis failed: {reason}', { reason: t(e.message) })
      } finally {
        // A superseded analysis leaves `busy` to the one that is still running.
        if (token === analysisToken) this.busy = false
      }
    },

    /**
     * New areas on the same palette (Simplify or Geometric changed): every area takes the entry of
     * its colour. Detached areas belonged to the areas before and are gone; colour changes stay.
     */
    mapAreas() {
      const seg = this.segmentation
      if (!seg || !this.clusterEntry) return
      this.entries = this.entries.slice(0, this.baseEntries)
      this.order = this.order.filter((i) => i < this.baseEntries)
      this.regionEntry = markRaw(Int32Array.from(seg.regions, (r) => this.clusterEntry.get(r.cluster) ?? 0))
      this.countShares()
      this.selectedEntry = null
      this.selectedRegion = null
      this.inspected = null
      this.renderVersion++
    },

    /**
     * How much of the picture every entry covers, from the areas of the whole picture as they are
     * on screen. Without them (the palette was found while a close-up was open), its share of the palette.
     */
    countShares() {
      const whole = paletteOf(this)
      const seg = whole.segmentation
      const current = seg && whole.regionEntry && areaKey === areaKeyOf(this.settings) && seg.regions.length === whole.regionEntry.length
      if (!current) {
        for (const e of this.entries) e.share = e.weight ?? 0
        return
      }
      const total = seg.width * seg.height
      const shares = new Float64Array(this.entries.length)
      seg.regions.forEach((region, r) => { shares[whole.regionEntry[r]] += region.size / total })
      this.entries.forEach((e, i) => { e.share = shares[i] })
    },

    /**
     * Layer mode: glazes of the base paints. On Auto the app proposes the paints from the paint
     * palette's Auto pool, otherwise the ones chosen in the paint box are fitted.
     */
    async analyseLayers(rgba, width, height, token = ++analysisToken) {
      const paints = usePaintsStore()
      const palette = paints.palette
      const { layerCount, maxCoats, layerAccents } = this.settings
      const proposalKey = [this.planStamp, layerCount, maxCoats, layerAccents].join('/')
      // Propose only when there is nothing to keep: a new picture, another number of layers or
      // coats or accents (the best paints depend on those), or Auto pressed.
      // With an AI plan its paints are the layers, in its order; the paint box is left alone.
      const chosen = (this.aiActive?.layers ?? []).filter((id) => paints.byId[id])
      let propose = !chosen.length && palette.layerAuto && !(layerProposal === proposalKey && palette.layerIds.length)
      const poolOf = () => (chosen.length ? chosen.map((id) => paints.byId[id]) : propose ? paints.autoCandidates : paints.layerPaints).map(({ id, hex }) => ({ id, hex }))
      const pool = poolOf()
      this.layerStep = null
      this.layerPoint = null
      try {
        if (!pool.length) {
          this.layers = null
          this.layerShown = []
          this.renderVersion++
          return
        }
        const plan = (picture, rgbaOf, paintPool) =>
          runSegmentation({
            kind: 'layers',
            rgba: rgbaOf,
            width: picture.width,
            height: picture.height,
            paints: paintPool,
            // Auto: the number of wash layers (accent paints come on top). By hand: every chosen paint may be one.
            count: !chosen.length && palette.layerAuto ? this.settings.layerCount : undefined,
            // A plain copy: the worker cannot be sent the reactive array of the store.
            paintIds: chosen.length ? chosen : propose ? undefined : [...palette.layerIds],
            maxCoats: this.settings.maxCoats,
            simplify: this.settings.layerSimplify,
            geometric: this.settings.geometric,
            accents: this.settings.layerAccents,
          })
        // The paints are chosen from the whole picture; a close-up is only fitted with them.
        if (propose && this.base) {
          const { result } = await plan(this.base.pixels, this.adjustedRgba(this.base.pixels).slice(), pool)
          if (token !== analysisToken || !this.layerMode) return
          paints.setLayerPaints(result.paintIds, true, palette)
          layerProposal = proposalKey
          propose = false
        }
        const { result } = await plan({ width, height }, rgba.slice(), propose || !this.base ? pool : poolOf())
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
        if (token === analysisToken) this.error = t('Analysis failed: {reason}', { reason: t(e.message) })
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

    /** A new palette: the colours are built from it again. */
    applySegmentation() {
      const whole = paletteOf(this)
      whole.regionEntry = null
      this.entries = []
      this.baseEntries = 0
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
      const pool = (paints.palette.auto ? paints.autoCandidates : paints.enabled).map(({ id, name, hex }) => ({ id, name, hex }))
      this.aiBusy = true
      this.aiError = null
      try {
        // A plan is for the whole picture, like the palette.
        const source = this.base ? { ...this.base.pixels, rgba: this.adjustedRgba(this.base.pixels) } : this.adjusted ?? this.pixels
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
      // The boxes of a plan lie in the whole picture.
      if (!plan?.details.length || !source || this.base) return
      const { width, height } = source
      const lab = toOklabPixels(source.rgba, width * height)
      const wash = detailWash(lab, width, height, boxMask(plan.details.map((d) => d.box), width, height))
      if (!wash.pixels) return
      const paints = usePaintsStore()
      const candidates = paints.palette.auto ? paints.autoCandidates : paints.enabled
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
      const plan = this.aiPlan?.key === this.aiKey && !this.base ? this.aiPlan.plan : null
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
      if (this.base) return // the match is that of the whole picture
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
      const { palette } = paletteOf(this)
      if (!palette || !(force || paints.palette.auto)) return
      if (!force && this.aiPaints) return // the AI chose them
      // Every wash is a target: a wash its mix cannot reach needs paints for a mix of its own.
      const targets = palette.clusters.filter((c) => c.pixelCount && !c.paper).map((c) => ({ hex: c.hex, weight: c.pixelCount }))
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
      const whole = paletteOf(this)
      const palette = whole.palette
      if (!palette) return
      // The areas on screen of the whole picture; while a close-up is open they can be those of
      // a palette before (see countShares) and are worked out again when it is closed.
      const seg = whole.segmentation
      // With an AI plan its paints are mixed with; the paint box is left alone.
      const paints = this.aiPaints ?? usePaintsStore().enabled
      const byId = usePaintsStore().byId
      const total = palette.width * palette.height
      const old = this.entries
      const oldRegionEntry = whole.regionEntry

      const values = this.valueMode
      const washOf = (recipe, hex) => (recipe.paints.length ? washRecipe(recipe, hex, byId, { values }) : recipe)
      // Value mode with paints that do not get as dark as the picture (a yellow alone): the values
      // of the picture are spread over what the paints reach, from blank paper for the lightest to
      // the darkest paint for the darkest, so that the picture keeps all its steps instead of
      // ending in one flat dark. Paints that reach the darks leave the values alone.
      // The paper is no mix: it comes on top of "Colours".
      const paper = palette.clusters.find((c) => c.paper)
      let clusters = palette.clusters.filter((c) => !c.paper)
      if (values && paints.length) {
        const used = clusters.filter((c) => c.pixelCount).map((c) => hexToOklab(c.hex)[0])
        const light = Math.max(...used), dark = Math.min(...used)
        const reach = valueReach(paints, { maxPaints: this.settings.maxPaints })
        if (reach > dark && light > dark) {
          clusters = clusters.map((c) => {
            const L = hexToOklab(c.hex)[0]
            return { ...c, hex: oklabToHex([1 - ((light - L) * (1 - reach)) / (light - dark), 0, 0]) }
          })
        }
      }
      const groups = planMixes(clusters, paints, {
        maxPaints: this.settings.maxPaints,
        // The AI's colours are the mixes: none of them is joined with another.
        wanted: this.aiActive?.mixes.length ? Math.max(this.settings.colours, this.aiActive.mixes.length) : this.settings.colours,
        variety: varietyOf(this.settings.details),
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
      if (paper) {
        mixRecipes[paper.group] = [paperRecipe(PAPER_HEX)]
        built.push({ group: paper.group, clusters: [paper.index], pixels: paper.pixelCount, lab: hexToOklab(paper.pixelCount ? paper.hex : PAPER_HEX), letter: '', paper: true })
      }

      // Largest first, so the entry numbers used in saved pictures stay meaningful; the paper last.
      built.sort((x, y) => !!x.paper - !!y.paper || y.pixels - x.pixels)
      const clusterToEntry = new Map()
      const entries = built.map((item, i) => {
        item.clusters.forEach((c) => clusterToEntry.set(c, i))
        const hex = item.hex ?? oklabToHex(item.lab)
        return {
          id: i,
          group: item.group,
          letter: item.letter,
          ...(item.paper ? { paper: true } : {}),
          sourceHex: hex,
          targetHex: hex,
          overridden: false,
          weight: item.pixels / total, // its share of the palette: what the numbers go by
          share: item.pixels / total, // its share of the areas on screen, see countShares
          recipes: [],
          chosen: 0,
          family: `mix-${item.group}`,
          label: '',
        }
      })
      const regionEntry = Int32Array.from(seg?.regions ?? [], (r) => clusterToEntry.get(r.cluster) ?? 0)

      // Carry over what the user changed.
      const pickedPaints = {}
      for (const e of old) if (!e.overridden && e.chosen && e.recipes[e.chosen]) pickedPaints[e.group] = paintKey(e.recipes[e.chosen])
      old.slice(0, this.baseEntries).forEach((e) => {
        if (!e.overridden) return
        const match = entries.find((n) => n.group === e.group && n.letter === e.letter && !!n.paper === !!e.paper)
        if (match) Object.assign(match, { targetHex: e.targetHex, overridden: true, kept: e.chosen ? paintKey(e.recipes[e.chosen]) : null })
      })
      const baseEntries = entries.length
      old.slice(this.baseEntries).forEach((e, n) => {
        const id = entries.length
        const oldIndex = this.baseEntries + n
        // Detached areas point at the areas on screen: they are only there while those are the same.
        if (!seg || oldRegionEntry?.length !== seg.regions.length) return
        seg.regions.forEach((_, r) => {
          if (oldRegionEntry[r] === oldIndex) regionEntry[r] = id
        })
        entries.push({ ...e, id, recipes: [], kept: e.chosen ? paintKey(e.recipes[e.chosen]) : null })
      })

      this.mixRecipes = markRaw(mixRecipes)
      this.entries = entries
      this.baseEntries = baseEntries
      whole.regionEntry = markRaw(regionEntry)
      whole.clusterEntry = markRaw(clusterToEntry)
      this.countShares()
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
      // A new palette: the close-up on screen takes its colours from it. Until then its areas
      // stay drawn, and must not point past the end of the new list.
      if (this.base) {
        if (this.regionEntry) this.regionEntry = markRaw(this.regionEntry.map((e) => Math.max(0, Math.min(e, entries.length - 1))))
        this.assignCloseup()
      }
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
          r.paints.length ? washRecipe(r, entry.targetHex, store.byId, { values: this.valueMode }) : paperRecipe(entry.targetHex),
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
        if (!families.has(e.family)) families.set(e.family, { weight: 0, paper: !!e.paper && !e.overridden, members: [] })
        const family = families.get(e.family)
        // The numbers go by the palette, not by the areas on screen: Simplify leaves them alone.
        family.weight += e.weight ?? e.share
        family.members.push(i)
      })
      const strength = (i) => this.entries[i].recipes[0]?.strength ?? 0
      this.order = []
      // The paper is 0, after every mix.
      ;[...families.values()]
        .sort((a, b) => a.paper - b.paper || b.weight - a.weight)
        .forEach((family, n) => {
          family.members.sort((a, b) => strength(a) - strength(b) || a - b)
          const washes = new Set(family.members.map((i) => this.entries[i].letter)).size > 1
          for (const i of family.members) {
            this.entries[i].label = family.paper ? '0' : `${n + 1}${washes ? this.entries[i].letter : ''}`
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
        weight: 0,
        ...(source.paper ? { paper: true } : {}),
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
