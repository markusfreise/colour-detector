import { describe, it, expect, afterEach, vi } from 'vitest'

describe('analytics events', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('sends nothing before consent started Analytics', async () => {
    const gtag = vi.fn()
    vi.stubGlobal('window', { gtag })
    const { trackEvent } = await import('../lib/analytics.js')
    trackEvent('credit_unlock', { credits_left: 0 })
    expect(gtag).not.toHaveBeenCalled()
  })

  it('sends an event once Analytics runs', async () => {
    const appended = []
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { createElement: () => ({}), head: { appendChild: (el) => appended.push(el) }, cookie: '' })
    const { startAnalytics, trackEvent } = await import('../lib/analytics.js')
    startAnalytics('G-TEST')
    const calls = []
    window.gtag = (...args) => calls.push(args)
    trackEvent('blocking_opened', { mode: 'mix' })
    expect(calls).toEqual([['event', 'blocking_opened', { mode: 'mix' }]])
  })
})
