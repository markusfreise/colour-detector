import { defineStore } from 'pinia'
import { GA_MEASUREMENT_ID } from '../config.js'
import { startAnalytics, stopAnalytics } from '../lib/analytics.js'

const STORAGE_KEY = 'colour-detector:analytics-consent'

function loadChoice() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'granted' || raw === 'denied' ? raw : null
  } catch {
    return null // storage unavailable – ask again next time
  }
}

export const useConsentStore = defineStore('consent', {
  state: () => ({
    // 'granted' | 'denied' | null (not asked yet)
    choice: loadChoice(),
    reviewing: false,
  }),
  getters: {
    // Without a measurement ID there is nothing to consent to.
    available: () => Boolean(GA_MEASUREMENT_ID),
    bannerVisible: (state) => Boolean(GA_MEASUREMENT_ID) && (state.choice === null || state.reviewing),
  },
  actions: {
    init() {
      if (this.choice === 'granted') startAnalytics(GA_MEASUREMENT_ID)
    },
    decide(granted) {
      this.choice = granted ? 'granted' : 'denied'
      this.reviewing = false
      try {
        localStorage.setItem(STORAGE_KEY, this.choice)
      } catch {
        // ignore – the choice just won't survive a reload
      }
      if (granted) startAnalytics(GA_MEASUREMENT_ID)
      else stopAnalytics(GA_MEASUREMENT_ID)
    },
    review() {
      this.reviewing = true
    },
  },
})
