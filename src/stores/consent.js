import { defineStore } from 'pinia'
import { GA_MEASUREMENT_ID } from '../config.js'
import { startAnalytics, stopAnalytics } from '../lib/analytics.js'
import { CONSENT_VERSION, validChoice } from '../lib/consent.js'

const STORAGE_KEY = 'colour-detector:consent'

function loadChoice() {
  try {
    return validChoice(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'), Date.now())
  } catch {
    return null // storage unavailable or unreadable: ask again
  }
}

// Cookies: the necessary ones need no consent and are only listed; Google Analytics runs only
// after an explicit yes, which can be withdrawn at any time under "Privacy settings".
export const useConsentStore = defineStore('consent', {
  state: () => ({
    choice: loadChoice(), // { analytics, version, at } or null (not asked, or to be asked again)
    reviewing: false,
    details: false, // the categories shown, with a switch for each
    analytics: false, // the switch in the details, before saving
  }),
  getters: {
    // Without a measurement ID nothing needs consent, and there is no banner.
    available: () => Boolean(GA_MEASUREMENT_ID),
    bannerVisible: (state) => Boolean(GA_MEASUREMENT_ID) && (state.choice === null || state.reviewing),
    granted: (state) => Boolean(state.choice?.analytics),
  },
  actions: {
    init() {
      if (this.granted) startAnalytics(GA_MEASUREMENT_ID)
    },
    decide(analytics) {
      this.choice = { analytics, version: CONSENT_VERSION, at: Date.now() }
      this.reviewing = false
      this.details = false
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.choice))
        localStorage.removeItem('colour-detector:analytics-consent') // the old form of the choice
      } catch {
        // the choice holds until the page is closed
      }
      if (analytics) startAnalytics(GA_MEASUREMENT_ID)
      else stopAnalytics(GA_MEASUREMENT_ID)
    },
    // "Privacy settings": the banner again, with the details open and the current choice set.
    review() {
      this.analytics = this.granted
      this.details = true
      this.reviewing = true
    },
    showDetails() {
      this.analytics = this.granted
      this.details = true
    },
  },
})
