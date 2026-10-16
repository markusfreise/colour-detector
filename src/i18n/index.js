import { computed } from 'vue'
import { getActivePinia } from 'pinia'
import { usePreferencesStore } from '../stores/preferences.js'
import de from './de.js'

const MESSAGES = { de }
// For dates and numbers.
const REGIONS = { en: 'en-GB', de: 'de-DE' }

/**
 * The text in the chosen language. The English text is the key; a text without a translation
 * stays English. "{name}" in the text is replaced by params.name. A word that German says in two
 * ways carries its context after "@@" ("Paint@@column"); English shows the part before it.
 * @param {string} locale  'en' or 'de'
 * @param {string} text
 * @param {Record<string, string | number>} [params]
 */
export function translate(locale, text, params) {
  const out = MESSAGES[locale]?.[text] ?? text.split('@@')[0]
  return params ? out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : out
}

/** The name of a paint in that language: the German one where the stock has it. */
export function nameIn(locale, paint) {
  return (locale === 'de' && paint?.nameDe) || paint?.name || ''
}

/** The locale of the moment; English without a Pinia (plain tests). */
export function currentLocale() {
  return getActivePinia() ? usePreferencesStore().locale : 'en'
}

/** The region tag for dates and numbers, e.g. 'de-DE'. */
export function regionOf(locale) {
  return REGIONS[locale] ?? REGIONS.en
}

// The text pages next to the app, in each language (relative to the app, as its links are).
const PAGES = {
  en: { privacy: 'privacy/', terms: 'terms/', imprint: 'imprint/', manual: 'manual/' },
  de: { privacy: 'de/datenschutz/', terms: 'de/agb/', imprint: 'de/impressum/', manual: 'de/handbuch/' },
}

/** The address of a text page (privacy, terms, imprint, manual) in that language. */
export function pageIn(locale, page) {
  return (PAGES[locale] ?? PAGES.en)[page] ?? PAGES.en[page]
}

/**
 * For components: `const { t, paintName, legalPage } = useText()`; re-renders when the language
 * changes. `region` is the tag for toLocaleString and friends.
 */
export function useText() {
  const preferences = usePreferencesStore()
  const locale = computed(() => preferences.locale)
  return {
    t: (text, params) => translate(locale.value, text, params),
    paintName: (paint) => nameIn(locale.value, paint),
    legalPage: (page) => pageIn(locale.value, page),
    locale,
    region: computed(() => regionOf(locale.value)),
  }
}

/**
 * The water of a layer's wash in words, from `washGuide` in lib/layers.js (water, consistency):
 * "1 part paint to 20 parts water, like tea". `tr` is a t function.
 */
export function washGuideText(tr, { water, consistency }) {
  if (!Number.isFinite(water)) return tr('clear water')
  const like = tr(consistency)
  if (water < 1) return tr('1 part paint to hardly any water, like {consistency}', { consistency: like })
  return tr(water === 1 ? '1 part paint to {n} part water, like {consistency}' : '1 part paint to {n} parts water, like {consistency}', {
    n: water.toLocaleString(regionOf(currentLocale())),
    consistency: like,
  })
}

/** For stores and plain modules, read at the time of the call. */
export function t(text, params) {
  return translate(currentLocale(), text, params)
}

/** For stores and plain modules: the paint's name in the language of the moment. */
export function paintName(paint) {
  return nameIn(currentLocale(), paint)
}
