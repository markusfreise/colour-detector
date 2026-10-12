import { defineStore } from 'pinia'

const KEY = 'colour-detector:layout'

function stored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}
  } catch {
    return {}
  }
}

// How the page is arranged on this device: which panels are folded, and where the floating ones are.
export const useLayoutStore = defineStore('layout', {
  state: () => {
    const saved = stored()
    return {
      // Panel name -> true while only its header shows.
      collapsed: { ...saved.collapsed },
      // Panel name -> top left corner of a floating panel in the window; none for its place at the bottom right.
      positions: { ...saved.positions },
    }
  },
  actions: {
    toggle(name) {
      this.collapsed[name] = !this.collapsed[name]
      this.persist()
    },
    move(name, position) {
      this.positions[name] = position
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ collapsed: this.collapsed, positions: this.positions }))
      } catch {
        // Private mode: the arrangement lasts for this visit.
      }
    },
  },
})
