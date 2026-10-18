import { defineStore } from 'pinia'
import { stockPaints } from '../data/paints.js'
import { starterPaints } from '../data/starter.js'
import { useProStore } from './pro.js'
import { groupPaints, sortPaints, AUTO_OFF_DEFAULT, HOUSE_VENDOR, ownForm } from '../lib/paintbox.js'
import { t } from '../i18n/index.js'

const LEGACY_KEY = 'colour-detector:enabled-paints'
// Before paint boxes held paints, "boxes" were named selections; the active one became the palette.
const OLD_BOXES_KEY = 'colour-detector:boxes'
const PALETTE_KEY = 'colour-detector:palette'
const PAINTBOXES_KEY = 'colour-detector:paintboxes'
const CUSTOM_KEY = 'colour-detector:custom-paints'
const STARTER_KEY = 'colour-detector:starter-palette'
// The format of an exported paint box file.
export const BOX_FILE_FORMAT = 'watercolourlove-paintbox'

// Layer mode takes at most this many base paints: every one is a layer to paint and to let dry.
export const MAX_LAYER_PAINTS = 6

const defaultIds = () => stockPaints.filter((p) => p.enabled).map((p) => p.id)
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null // storage unavailable (private mode etc.) – fall back to defaults
  }
}

/**
 * A palette: the paints chosen for one picture. auto = the app picks them; layerIds = the base
 * paints of layer mode, kept apart from the mix selection; autoOff = ids of the paint boxes Auto
 * does not choose from. Fills in what older palettes lack.
 */
export function normalizePalette(palette) {
  const p = { paintIds: [], layerIds: [], layerAuto: true, autoOff: [...AUTO_OFF_DEFAULT], ...palette }
  // Palettes saved before Auto existed: an untouched default selection counts as Auto.
  p.auto ??= [...p.paintIds].sort().join() === defaultIds().sort().join()
  return { paintIds: [...p.paintIds], auto: p.auto, layerIds: [...p.layerIds], layerAuto: p.layerAuto, autoOff: [...p.autoOff] }
}

// The palette of the Starter box: all twelve colours, on Auto.
const starterPalette = () =>
  normalizePalette({ paintIds: starterPaints.map((p) => p.id), auto: true, autoOff: [], ...read(STARTER_KEY) })

function loadPalette() {
  const saved = read(PALETTE_KEY)
  if (saved) return normalizePalette(saved)
  const old = read(OLD_BOXES_KEY)
  if (old?.boxes?.length) return normalizePalette(old.boxes.find((b) => b.id === old.activeId) ?? old.boxes[0])
  // First start, or a selection saved before boxes existed.
  const legacy = read(LEGACY_KEY)
  return normalizePalette({ paintIds: legacy ?? defaultIds(), auto: !legacy })
}

// The first paint boxes are the groups the paints used to be listed in: their ids are the keys of
// those groups, so that the groups switched off for Auto stay off.
const SEED_NAMES = { pan: 'Pans', tube: 'Tubes', travelbox: 'Travelbox' }

function loadBoxes(paints) {
  const saved = read(PAINTBOXES_KEY)
  if (saved?.length) return saved
  return groupPaints(paints).map((g) => ({ id: g.key, name: SEED_NAMES[g.key] ?? g.name, paintIds: g.paints.map((p) => p.id) }))
}

const sameNumber = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
const sameVendor = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

export const usePaintsStore = defineStore('paints', {
  state: () => {
    const custom = read(CUSTOM_KEY) ?? [] // paints added by the user
    return {
      custom,
      // The paint boxes: [{ id, name, paintIds }], the paints one owns, in sets. At least one.
      boxes: loadBoxes([...stockPaints, ...custom]),
      // The palette of the picture on screen (normalizePalette); saved with the picture.
      selection: loadPalette(),
      // The palette while the free version mixes from the Starter box; kept apart from the user's.
      starterSelection: starterPalette(),
      // Behind signing in: a palette of its own with the showcase paints, in place of the user's
      // while it is set, and never saved (startShowcase / endShowcase).
      showcase: null,
    }
  },
  getters: {
    // The free version mixes from the Starter box; one's own paints take a credit on the picture, or a plan.
    starter: (state) => !state.showcase && !useProStore().can('own_paints'),
    all(state) {
      if (state.showcase) return state.showcase.paints
      return this.starter ? starterPaints : [...stockPaints, ...state.custom]
    },
    palette(state) {
      return state.showcase?.palette ?? (this.starter ? state.starterSelection : state.selection)
    },
    // Paints Auto may choose from: those in the paint boxes ticked for Auto. A Schmincke stock paint
    // outside the default selection is held back (its colour is not checked yet).
    autoCandidates() {
      const held = (p) => !p.enabled && !p.custom && p.vendor === HOUSE_VENDOR
      if (this.showcase || this.starter) return this.all.filter((p) => !held(p))
      const off = new Set(this.palette.autoOff)
      const ids = new Set(this.boxes.filter((b) => !off.has(b.id)).flatMap((b) => b.paintIds))
      return this.all.filter((p) => ids.has(p.id) && !held(p))
    },
    // Layer mode: the base paints, one layer each.
    layerPaints() {
      const byId = this.byId
      return this.palette.layerIds.map((id) => byId[id]).filter(Boolean)
    },
    // The paints mixed with.
    enabledIds() {
      return new Set(this.palette.paintIds)
    },
    enabled() {
      return this.all.filter((p) => this.enabledIds.has(p.id))
    },
    // Every paint the app knows, not only those mixed with now: the colours on screen can still name
    // paints of the other source for a moment (a picture switched between the Starter box and one's
    // own paints is mixed again a tick later).
    byId(state) {
      const known = [...stockPaints, ...state.custom, ...starterPaints, ...(state.showcase?.paints ?? [])]
      return Object.fromEntries(known.map((p) => [p.id, p]))
    },
    // Paint box: the selected paints as one list, the rest grouped by form.
    selected() {
      return sortPaints(this.enabled)
    },
  },
  actions: {
    toggle(id, on) {
      const next = new Set(this.palette.paintIds)
      if (on ?? !next.has(id)) next.add(id)
      else next.delete(id)
      this.setEnabled([...next])
    },
    clear() {
      this.setEnabled([])
    },
    /** Any selection made by hand switches Auto off for the box. */
    setEnabled(ids, auto = false) {
      this.palette.paintIds = [...ids]
      this.palette.auto = auto
      this.persist()
    },
    reset() {
      this.setEnabled(this.starter ? starterPaints.map((p) => p.id) : defaultIds())
    },
    /** Whether Auto may choose from the paints of a paint box. */
    setAutoBox(id, on) {
      const off = new Set(this.palette.autoOff)
      if (on) off.delete(id)
      else off.add(id)
      this.palette.autoOff = [...off]
      this.persist()
    },
    /**
     * The base paints of layer mode. Choosing them by hand switches their Auto off and is limited
     * to MAX_LAYER_PAINTS; a proposal may add a paint or two for its accents.
     */
    setLayerPaints(ids, auto = false, palette = this.palette) {
      palette.layerIds = auto ? [...ids] : [...ids].slice(0, MAX_LAYER_PAINTS)
      palette.layerAuto = auto
      this.persist()
    },
    toggleLayerPaint(id, on) {
      const ids = this.palette.layerIds.filter((p) => p !== id)
      if (on ?? ids.length === this.palette.layerIds.length) ids.push(id)
      this.setLayerPaints(ids)
    },

    /** The palette of a saved picture takes the place of the one on screen. */
    setPalette(palette) {
      if (this.showcase || !palette) return
      this.selection = normalizePalette(palette)
      this.persist()
    },

    addBox(name) {
      const box = { id: newId('box'), name: name.trim() || t('Box {n}', { n: this.boxes.length + 1 }), paintIds: [] }
      this.boxes.push(box)
      this.persist()
      return box
    },
    renameBox(id, name) {
      const box = this.boxes.find((b) => b.id === id)
      if (box && name.trim()) box.name = name.trim()
      this.persist()
    },
    /** The last box cannot be deleted. Its paints stay in the palette and in one's own paints. */
    deleteBox(id) {
      if (this.boxes.length < 2) return
      this.boxes = this.boxes.filter((b) => b.id !== id)
      this.selection.autoOff = this.selection.autoOff.filter((key) => key !== id)
      this.persist()
    },
    addToBox(boxId, paintId) {
      const box = this.boxes.find((b) => b.id === boxId)
      if (box && !box.paintIds.includes(paintId)) box.paintIds.push(paintId)
      this.persist()
    },
    removeFromBox(boxId, paintId) {
      const box = this.boxes.find((b) => b.id === boxId)
      if (box) box.paintIds = box.paintIds.filter((id) => id !== paintId)
      this.persist()
    },
    /**
     * A colour of a series, as a library or a box file has it: the paint already known with that
     * series and number, or a new paint of one's own. Returns its id.
     */
    paintFor({ vendor, number, name, hex, form = 'pan' }) {
      const known = this.all.find((p) => sameVendor(p.vendor, vendor) && sameNumber(p.number, number))
      if (known) return known.id
      const id = newId('custom')
      this.custom.push({ id, vendor: vendor.trim(), line: '', number: String(number).trim(), name: name.trim(), nameDe: '', hex, forms: [form], source: 'custom', enabled: false, custom: true })
      return id
    },
    /** A colour from a library into a box, in the form it names or the one of the box. Returns its id. */
    addColourToBox(boxId, colour) {
      const id = this.paintFor({ ...colour, form: colour.form ? ownForm(colour.form) : boxId === 'tube' ? 'tube' : 'pan' })
      this.addToBox(boxId, id)
      return id
    },

    /** A box as a file to keep: its name and its colours, each with series, number, name and colour. */
    exportBox(id) {
      const box = this.boxes.find((b) => b.id === id)
      if (!box) return null
      const byId = this.byId
      const paints = box.paintIds
        .map((pid) => byId[pid])
        .filter(Boolean)
        .map((p) => ({ vendor: p.vendor, number: String(p.number), name: p.name, hex: p.hex, form: p.forms[0] ?? 'pan' }))
      return { format: BOX_FILE_FORMAT, version: 1, name: t(box.name), paints }
    },
    /** A box file read back: a new box. Throws when the file is not one. */
    importBox(data) {
      if (data?.format !== BOX_FILE_FORMAT || !Array.isArray(data.paints)) throw new Error('This is not a paint box file.')
      const box = this.addBox(String(data.name ?? ''))
      for (const p of data.paints) {
        if (!p?.vendor || p.number == null || !p.name || !/^#[0-9a-f]{6}$/i.test(p.hex ?? '')) continue
        const id = this.paintFor({ vendor: String(p.vendor), number: String(p.number), name: String(p.name), hex: p.hex, form: ownForm(p.form) })
        if (!box.paintIds.includes(id)) box.paintIds.push(id)
      }
      this.persist()
      return box
    },

    /** Add a paint to the library, or update it when `paint.id` exists. New paints go into the box `boxId`. */
    savePaint(paint, boxId = null) {
      const data = {
        vendor: paint.vendor.trim(),
        line: '',
        number: String(paint.number).trim(),
        name: paint.name.trim(),
        nameDe: '',
        hex: paint.hex,
        forms: [paint.form],
        source: 'custom',
        enabled: false,
        custom: true,
      }
      const index = this.custom.findIndex((p) => p.id === paint.id)
      if (index >= 0) {
        this.custom[index] = { ...data, id: paint.id }
      } else {
        const id = newId('custom')
        this.custom.push({ ...data, id })
        if (boxId) this.addToBox(boxId, id)
      }
      this.persist()
    },
    deletePaint(id) {
      this.custom = this.custom.filter((p) => p.id !== id)
      for (const box of this.boxes) box.paintIds = box.paintIds.filter((p) => p !== id)
      this.selection.paintIds = this.selection.paintIds.filter((p) => p !== id)
      this.selection.layerIds = this.selection.layerIds.filter((p) => p !== id)
      this.persist()
    },

    /** Mixes with the given paints only, until endShowcase; the user's palette stays as it is. */
    startShowcase(paints) {
      const ids = paints.map((p) => p.id)
      this.showcase = { paints, palette: { paintIds: ids, auto: false, layerIds: ids, layerAuto: false, autoOff: [] } }
    },
    endShowcase() {
      this.showcase = null
    },
    persist() {
      if (this.showcase) return // the showcase palette is not the user's
      try {
        localStorage.setItem(PAINTBOXES_KEY, JSON.stringify(this.boxes))
        localStorage.setItem(PALETTE_KEY, JSON.stringify(this.selection))
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom))
        localStorage.setItem(STARTER_KEY, JSON.stringify(this.starterSelection))
      } catch {
        // ignore – the boxes just won't survive a reload
      }
    },
  },
})
