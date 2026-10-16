import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { translate, nameIn, pageIn, washGuideText } from '../i18n/index.js'
import de from '../i18n/de.js'
import { browserLanguage } from '../stores/preferences.js'
import { describeDilution, matchQuality, WASH_LETTERS } from '../lib/mixing.js'
import { washGuide } from '../lib/layers.js'

describe('German texts', () => {
  // Every t('...') with a plain text in the code, and the words the colour logic hands to the screen.
  const files = [
    'src/App.vue',
    ...readdirSync('src/components').filter((f) => f.endsWith('.vue') && f !== 'AiPanel.vue').map((f) => `src/components/${f}`),
    ...readdirSync('src/stores').map((f) => `src/stores/${f}`),
  ]
  const keys = new Set()
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)+)\1/g)) keys.add(m[2].replace(/\\(.)/g, '$1'))
  }

  it('has a German text for every text the code shows', () => {
    expect([...keys].filter((key) => !(key in de))).toEqual([])
  })

  it('has the words of the colour logic', () => {
    const words = [
      ...[0, 0.02, 0.05, 0.2, 0.5, 2].map(describeDilution),
      ...[1, 3, 7, 20].map(matchQuality),
      ...WASH_LETTERS.map((w) => w.label),
      ...[0, 0.01, 0.05, 0.2, 0.5, 1].map((s) => washGuide(s).consistency),
    ]
    expect(words.filter((w) => !(w in de))).toEqual([])
  })
})

describe('paint names, pages and washes', () => {
  it('uses the German name of a paint where there is one', () => {
    expect(nameIn('de', { name: 'Indigo', nameDe: 'Indigo dunkel' })).toBe('Indigo dunkel')
    expect(nameIn('de', { name: 'Own red' })).toBe('Own red')
    expect(nameIn('en', { name: 'Indigo', nameDe: 'Indigo dunkel' })).toBe('Indigo')
  })

  it('links the text pages in the language shown', () => {
    expect(pageIn('en', 'privacy')).toBe('privacy/')
    expect(pageIn('de', 'privacy')).toBe('de/datenschutz/')
    expect(pageIn('de', 'manual')).toBe('de/handbuch/')
  })

  it('says the water of a wash in German', () => {
    const tr = (text, params) => translate('de', text, params)
    expect(washGuideText(tr, { water: 20, consistency: 'tea' })).toBe('1 Teil Farbe auf 20 Teile Wasser, wie Tee')
    expect(washGuideText(tr, { water: Infinity, consistency: 'water' })).toBe('klares Wasser')
  })

  it('shows the English part of a key with a context', () => {
    expect(translate('en', 'Paint@@column')).toBe('Paint')
    expect(translate('de', 'Paint@@column')).toBe('Farbe')
  })
})

describe('translate', () => {
  it('gives the German text, and the English one where there is none', () => {
    expect(translate('de', 'Language')).toBe('Sprache')
    expect(translate('de', 'No such text')).toBe('No such text')
    expect(translate('en', 'Language')).toBe('Language')
  })

  it('fills in the parameters', () => {
    expect(translate('en', '{n} colours', { n: 5 })).toBe('5 colours')
    expect(translate('en', '{n} of {m}', { n: 1 })).toBe('1 of {m}')
  })

  it('keeps the placeholders of every German text', () => {
    for (const [en, text] of Object.entries(de)) {
      const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(names(text), en).toEqual(names(en))
    }
  })
})

describe('browserLanguage', () => {
  it('is German for any German locale and English otherwise', () => {
    expect(browserLanguage(['de-DE', 'en'])).toBe('de')
    expect(browserLanguage(['en-GB', 'de'])).toBe('de')
    expect(browserLanguage(['fr-FR'])).toBe('en')
    expect(browserLanguage([])).toBe('en')
  })
})
