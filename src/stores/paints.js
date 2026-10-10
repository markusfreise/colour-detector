import { defineStore } from 'pinia'
import { stockPaints } from '../data/paints.js'
import { groupPaints } from '../lib/paintbox.js'

const STORAGE_KEY = 'colour-detector:enabled-paints'

function loadEnabled() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {
    // storage unavailable (private mode etc.) – fall back to defaults
  }
  return new Set(stockPaints.filter((p) => p.enabled).map((p) => p.id))
}

export const usePaintsStore = defineStore('paints', {
  state: () => ({
    all: stockPaints,
    enabledIds: loadEnabled(),
  }),
  getters: {
    enabled: (state) => state.all.filter((p) => state.enabledIds.has(p.id)),
    byId: (state) => Object.fromEntries(state.all.map((p) => [p.id, p])),
    groups: (state) => groupPaints(state.all),
  },
  actions: {
    toggle(id, on) {
      const next = new Set(this.enabledIds)
      if (on ?? !next.has(id)) next.add(id)
      else next.delete(id)
      this.enabledIds = next
      this.persist()
    },
    setAll(ids, on) {
      const next = new Set(this.enabledIds)
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)))
      this.enabledIds = next
      this.persist()
    },
    reset() {
      this.enabledIds = new Set(this.all.filter((p) => p.enabled).map((p) => p.id))
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.enabledIds]))
      } catch {
        // ignore – selection just won't survive a reload
      }
    },
  },
})
