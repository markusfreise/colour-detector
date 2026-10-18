import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PLANS, activeProducts } from '../lib/entitlements.js'

// The pricing pages are plain HTML: they have to say what plans.json says.
const pages = {
  en: { html: readFileSync('public/pricing/index.html', 'utf8'), price: (c) => `€${c % 100 ? (c / 100).toFixed(2) : c / 100}` },
  de: { html: readFileSync('public/de/preise/index.html', 'utf8'), price: (c) => `${c % 100 ? (c / 100).toFixed(2).replace('.', ',') : c / 100} €` },
}

describe('pricing pages', () => {
  for (const [lang, { html, price }] of Object.entries(pages)) {
    it(`${lang} shows the amount of every active product`, () => {
      const missing = activeProducts().filter((p) => !html.includes(price(p.amount))).map((p) => `${p.key} ${price(p.amount)}`)
      expect(missing).toEqual([])
    })

    it(`${lang} shows the early bird as plans.json has it`, () => {
      const early = PLANS.early_bird
      expect(html).toContain(`data-ends="${early.ends}"`)
      expect(html).toContain(early.code)
      expect(html).toContain(`${early.percent_off} %`)
      expect(html).toContain(`${early.max_redemptions}`)
    })
  }
})
