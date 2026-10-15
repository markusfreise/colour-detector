import { computed } from 'vue'
import { usePreferencesStore } from '../stores/preferences.js'
import de from './de.js'

const MESSAGES = { de }

/**
 * The text in the chosen language. The English text is the key; a text without a translation
 * stays English. "{name}" in the text is replaced by params.name.
 * @param {string} text
 * @param {Record<string, string | number>} [params]
 */
export function translate(locale, text, params) {
  const out = MESSAGES[locale]?.[text] ?? text
  return params ? out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : out
}

/** For components: `const { t } = useText()`; re-renders when the language changes. */
export function useText() {
  const preferences = usePreferencesStore()
  const locale = computed(() => preferences.locale)
  return { t: (text, params) => translate(locale.value, text, params), locale }
}

/** For stores and plain modules, read at the time of the call. */
export function t(text, params) {
  return translate(usePreferencesStore().locale, text, params)
}
