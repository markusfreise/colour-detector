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
    // On a phone the picture comes first: the panels start folded, whatever was open last time.
    const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
    return {
      // Panel name -> true while only its header shows.
      collapsed: phone ? { ...saved.collapsed, controls: true, palette: true } : { ...saved.collapsed },
      // Panel name -> top left corner of a floating panel in the window; none for its place at the bottom right.
      positions: { ...saved.positions },
      // Whether the settings were opened once by themselves, with the first picture (App.vue).
      settingsShown: !!saved.settingsShown,
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
    /** With the first picture ever: the settings open once by themselves, so that they are found. */
    showSettingsOnce() {
      if (this.settingsShown) return
      this.settingsShown = true
      this.collapsed.controls = false
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ collapsed: this.collapsed, positions: this.positions, settingsShown: this.settingsShown }))
      } catch {
        // Private mode: the arrangement lasts for this visit.
      }
    },
  },
})
