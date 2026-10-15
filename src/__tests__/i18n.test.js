import { describe, expect, it } from 'vitest'
import { translate } from '../i18n/index.js'
import de from '../i18n/de.js'
import { browserLanguage } from '../stores/preferences.js'

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
