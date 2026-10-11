import { defineStore } from 'pinia'
import { stockPaints } from '../data/paints.js'
import { groupPaints, sortPaints } from '../lib/paintbox.js'

const LEGACY_KEY = 'colour-detector:enabled-paints'
const BOXES_KEY = 'colour-detector:boxes'
const CUSTOM_KEY = 'colour-detector:custom-paints'

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

function loadBoxes() {
  const saved = read(BOXES_KEY)
  if (saved?.boxes?.length) {
    // Boxes saved before Auto existed: an untouched default selection counts as Auto.
    const defaults = defaultIds().sort().join()
    for (const box of saved.boxes) {
      box.auto ??= [...box.paintIds].sort().join() === defaults
      box.layerIds ??= []
      box.layerAuto ??= true
    }
    return saved
  }
  // First start, or a selection saved before boxes existed.
  const legacy = read(LEGACY_KEY)
  const box = { id: 'box-1', name: 'My paint box', paintIds: legacy ?? defaultIds(), auto: !legacy, layerIds: [], layerAuto: true }
  return { boxes: [box], activeId: box.id }
}

export const usePaintsStore = defineStore('paints', {
  state: () => {
    const { boxes, activeId } = loadBoxes()
    return {
      custom: read(CUSTOM_KEY) ?? [], // paints added by the user
      // [{ id, name, paintIds, auto, layerIds, layerAuto }] auto = the app picks the paints for each
      // picture; layerIds = the base paints of layer mode, kept apart from the mix selection
      boxes,
      activeId,
    }
  },
  getters: {
    all: (state) => [...stockPaints, ...state.custom],
    activeBox: (state) => state.boxes.find((b) => b.id === state.activeId) ?? state.boxes[0],
    // Paints Auto may choose from: the default selection and the user's own paints.
    autoCandidates() {
      return this.all.filter((p) => p.enabled || p.custom)
    },
    // Layer mode: the base paints, one layer each.
    layerPaints() {
      const byId = this.byId
      return this.activeBox.layerIds.map((id) => byId[id]).filter(Boolean)
    },
    enabledIds() {
      return new Set(this.activeBox.paintIds)
    },
    enabled() {
      return this.all.filter((p) => this.enabledIds.has(p.id))
    },
    byId() {
      return Object.fromEntries(this.all.map((p) => [p.id, p]))
    },
    // Paint box: the selected paints as one list, the rest grouped by form.
    selected() {
      return sortPaints(this.enabled)
    },
    available() {
      return groupPaints(this.all.filter((p) => !this.enabledIds.has(p.id)))
    },
  },
  actions: {
    toggle(id, on) {
      const next = new Set(this.enabledIds)
      if (on ?? !next.has(id)) next.add(id)
      else next.delete(id)
      this.setEnabled([...next])
    },
    clear() {
      this.setEnabled([])
    },
    /** Any selection made by hand switches Auto off for the box. */
    setEnabled(ids, auto = false) {
      this.activeBox.paintIds = [...ids]
      this.activeBox.auto = auto
      this.persist()
    },
    reset() {
      this.setEnabled(defaultIds())
    },
    /** The base paints of layer mode. Choosing them by hand switches their Auto off. */
    setLayerPaints(ids, auto = false, box = this.activeBox) {
      box.layerIds = [...ids].slice(0, MAX_LAYER_PAINTS)
      box.layerAuto = auto
      this.persist()
    },
    toggleLayerPaint(id, on) {
      const ids = this.activeBox.layerIds.filter((p) => p !== id)
      if (on ?? ids.length === this.activeBox.layerIds.length) ids.push(id)
      this.setLayerPaints(ids)
    },

    addBox(name) {
      const box = { id: newId('box'), name: name.trim() || `Box ${this.boxes.length + 1}`, paintIds: [], auto: false, layerIds: [], layerAuto: true }
      this.boxes.push(box)
      this.activeId = box.id
      this.persist()
    },
    selectBox(id) {
      this.activeId = id
      this.persist()
    },
    renameBox(id, name) {
      const box = this.boxes.find((b) => b.id === id)
      if (box && name.trim()) box.name = name.trim()
      this.persist()
    },
    /** The last box cannot be deleted. */
    deleteBox(id) {
      if (this.boxes.length < 2) return
      this.boxes = this.boxes.filter((b) => b.id !== id)
      if (this.activeId === id) this.activeId = this.boxes[0].id
      this.persist()
    },

    /** Add a paint to the library, or update it when `paint.id` exists. New paints go into the active box. */
    savePaint(paint) {
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
        this.activeBox.paintIds.push(id)
      }
      this.persist()
    },
    deletePaint(id) {
      this.custom = this.custom.filter((p) => p.id !== id)
      for (const box of this.boxes) {
        box.paintIds = box.paintIds.filter((p) => p !== id)
        box.layerIds = box.layerIds.filter((p) => p !== id)
      }
      this.persist()
    },

    persist() {
      try {
        localStorage.setItem(BOXES_KEY, JSON.stringify({ boxes: this.boxes, activeId: this.activeId }))
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(this.custom))
      } catch {
        // ignore – the boxes just won't survive a reload
      }
    },
  },
})
