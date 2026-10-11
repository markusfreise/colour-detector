import { defineStore } from 'pinia'
import { AI_PROVIDERS } from '../lib/ai.js'

const KEY = 'colour-detector:ai'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}
  } catch {
    return {} // storage unavailable (private mode etc.)
  }
}

/**
 * The user's own access to an AI provider: which one, which model, their key, and whether they
 * agreed to pictures being sent there. Everything stays in this browser; the key is only written
 * to its storage when the user asks for that.
 */
export const useAiStore = defineStore('ai', {
  state: () => {
    const saved = read()
    return {
      provider: AI_PROVIDERS[saved.provider] ? saved.provider : 'anthropic',
      models: { anthropic: AI_PROVIDERS.anthropic.defaultModel, openai: AI_PROVIDERS.openai.defaultModel, ...saved.models },
      keys: { anthropic: '', openai: '', ...saved.keys },
      remember: !!saved.remember,
      // Per provider: the user agreed that a copy of the picture is sent there.
      consent: { anthropic: false, openai: false, ...saved.consent },
    }
  },
  getters: {
    info: (state) => AI_PROVIDERS[state.provider],
    model: (state) => state.models[state.provider],
    key: (state) => state.keys[state.provider].trim(),
    agreed: (state) => !!state.consent[state.provider],
    ready() {
      return !!this.key && this.agreed && !!this.model
    },
  },
  actions: {
    persist() {
      const { provider, models, consent, remember } = this
      try {
        // Without "remember" the key lives only as long as the page.
        localStorage.setItem(KEY, JSON.stringify({ provider, models, consent, remember, keys: remember ? this.keys : undefined }))
      } catch {
        // nothing to do: the settings then last for this visit
      }
    },
    forget() {
      this.keys = { anthropic: '', openai: '' }
      this.consent = { anthropic: false, openai: false }
      this.remember = false
      this.persist()
    },
  },
})
