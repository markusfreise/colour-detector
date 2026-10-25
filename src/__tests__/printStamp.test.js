import { describe, it, expect } from 'vitest'
import { printStamp, printStampRule } from '../lib/printStamp.js'

describe('print stamp', () => {
  const when = new Date(2026, 9, 24, 14, 3)

  it('names the picture and the time it was printed, in the language of the app', () => {
    expect(printStamp('Underground', when, 'de-DE')).toBe('Underground · 24.10.2026, 14:03')
    expect(printStamp('Underground', when, 'en-GB')).toMatch(/^Underground · 24 Oct 2026, 14:03$/)
    expect(printStamp('', when, 'de-DE')).toBe('24.10.2026, 14:03')
  })

  it('goes into the bottom margin of every page, with the page number', () => {
    const rule = printStampRule('Brücke "Nord" · 24.10.2026, 14:03')
    expect(rule).toContain('@bottom-left { content: "Brücke \\"Nord\\" · 24.10.2026, 14:03";')
    expect(rule).toContain('@bottom-right { content: counter(page) " / " counter(pages);')
  })
})
