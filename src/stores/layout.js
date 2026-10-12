import { defineStore } from 'pinia'

const KEY = 'colour-detector:layout'

function stored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}
  } catch {
    return {}
  }
}

// How the page is arranged on this device: which panels are folded, and where the colours float.
export const useLayoutStore = defineStore('layout', {
  state: () => {
    const saved = stored()
    return {
      // Panel name -> true while only its header shows.
      collapsed: { ...saved.collapsed },
      // Top left corner of the floating colours in the window, or null for its place at the bottom right.
      palette: saved.palette ?? null,
    }
  },
  actions: {
    toggle(name) {
      this.collapsed[name] = !this.collapsed[name]
      this.persist()
    },
    movePalette(position) {
      this.palette = position
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ collapsed: this.collapsed, palette: this.palette }))
      } catch {
        // Private mode: the arrangement lasts for this visit.
      }
    },
  },
})
