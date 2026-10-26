import { defineStore } from 'pinia'

// The guided tour (GuidedTour.vue): four steps over the app's own buttons, shown once per device
// on its first start, and again on request (Help, or a link to #tour).
const KEY = 'colour-detector:tour'

function seenBefore() {
  try {
    return localStorage.getItem(KEY) === 'seen'
  } catch {
    return false
  }
}

export const useTourStore = defineStore('tour', {
  state: () => ({
    step: null, // the step shown, 0..3; null while there is no tour
    seen: seenBefore(),
  }),
  actions: {
    start() {
      this.step = 0
    },
    next(steps) {
      if (this.step === null) return
      if (this.step + 1 < steps) this.step += 1
      else this.end()
    },
    /** As on a device that never saw it (the debug menu): it starts again at once. */
    reset() {
      this.seen = false
      try {
        localStorage.removeItem(KEY)
      } catch {
        // Nothing kept.
      }
      this.start()
    },
    /** Skipped or finished: it does not come back by itself on this device. */
    end() {
      this.step = null
      this.seen = true
      try {
        localStorage.setItem(KEY, 'seen')
      } catch {
        // Private windows may refuse storage; then the tour comes once per visit.
      }
    },
  },
})
