import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { MIX_API } from '../config.js'

// The colour charts of the paint series that come with the app (PAINT_LIBRARIES), asked from the
// account API once they may be used: they come with Pro.
export const useChartsStore = defineStore('charts', {
  state: () => ({
    charts: null, // { <library id>: [{ number, name, hex }] } (raw)
    loading: false,
  }),
  actions: {
    async load() {
      if (this.charts || this.loading) return
      this.loading = true
      try {
        const response = await fetch(`${MIX_API}/charts`, { credentials: 'same-origin' })
        if (response.ok) this.charts = markRaw((await response.json()).charts)
      } catch {
        // Without a connection there are no charts; the next opening of the paint box asks again.
      } finally {
        this.loading = false
      }
    },
    /** The chart of a library, empty until it is there. */
    of(id) {
      return this.charts?.[id] ?? []
    },
  },
})
