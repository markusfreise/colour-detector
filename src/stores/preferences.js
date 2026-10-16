import { defineStore } from 'pinia'

const KEY = 'colour-detector:preferences'
export const LANGUAGES = ['auto', 'en', 'de']
export const THEMES = ['auto', 'light', 'dark']

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}
  } catch {
    return {}
  }
}

/** The language of the browser, if the app speaks it; English otherwise. */
export function browserLanguage(languages = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []) {
  return languages.some((l) => /^de\b/i.test(l ?? '')) ? 'de' : 'en'
}

// Language and light/dark, kept in this browser. "auto" follows the browser and the system.
export const usePreferencesStore = defineStore('preferences', {
  state: () => {
    const saved = load()
    return {
      language: LANGUAGES.includes(saved.language) ? saved.language : 'auto',
      theme: THEMES.includes(saved.theme) ? saved.theme : 'auto',
    }
  },
  getters: {
    locale: (state) => (state.language === 'auto' ? browserLanguage() : state.language),
  },
  actions: {
    set(changes) {
      Object.assign(this, changes)
      try {
        localStorage.setItem(KEY, JSON.stringify({ language: this.language, theme: this.theme }))
      } catch {
        // Without storage the choice holds until the page is closed.
      }
      this.apply()
    },
    // The theme as an attribute on <html> (the stylesheet reads it), and the language of the page.
    apply() {
      const root = document.documentElement
      if (this.theme === 'auto') delete root.dataset.theme
      else root.dataset.theme = this.theme
      root.lang = this.locale
    },
  },
})
