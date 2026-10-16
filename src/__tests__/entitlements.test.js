import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { canUse, featureGroup, activeProducts, freeSavedPictures, PLANS } from '../lib/entitlements.js'
import { usePaintsStore } from '../stores/paints.js'
import { useProStore } from '../stores/pro.js'
import { useAccountStore } from '../stores/account.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { starterPaints } from '../data/starter.js'
import shared from '../../server/tests/entitlement-cases.json'

// The same cases as server/tests/entitlements.test.php: the app and the account API decide alike.
describe('entitlements: the cases shared with the server', () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const state = { plan: c.state.plan ?? null, unlocked: new Set(c.state.unlocked ?? []), picture: c.picture ? { hash: c.picture, sample: false } : null }
      expect(canUse(state, c.feature)).toBe(c.expected)
    })
  }
})

describe('entitlements: the app only', () => {
  it('locks nothing without accounts', () => {
    expect(canUse({ open: true }, 'ai')).toBe(true)
  })

  it('unlocks the picture features of a sample, not the studio', () => {
    const state = { picture: { sample: true, hash: null } }
    expect(canUse(state, 'own_paints')).toBe(true)
    expect(canUse(state, 'print')).toBe(true)
    expect(canUse(state, 'paint_boxes')).toBe(false)
  })

  it('keeps the free version of the App Store app as it was', () => {
    expect(canUse({ native: true }, 'own_paints')).toBe(true)
    expect(canUse({ native: true }, 'monochrome')).toBe(true)
    expect(canUse({ native: true }, 'paint_boxes')).toBe(false)
    expect(canUse({ native: true, nativeUnlocked: true }, 'paint_boxes')).toBe(true)
    expect(freeSavedPictures(true)).toBe(1)
    expect(freeSavedPictures(false)).toBe(0)
  })

  it('takes an unknown feature for a mistake', () => {
    expect(() => canUse({}, 'no-such-feature')).toThrow(/Unknown feature/)
  })

  it('reads the groups and the products from the config', () => {
    expect(featureGroup('blocking')).toBe('picture')
    expect(featureGroup('monochrome')).toBe('studio')
    expect(activeProducts().map((p) => p.sort)).toEqual([...activeProducts().map((p) => p.sort)].sort((a, b) => a - b))
    expect(PLANS.products.filter((p) => p.type === 'credit_pack').every((p) => p.quantity > 0)).toBe(true)
  })
})

describe('entitlements: the Starter box', () => {
  let paints, pro, account, analysis
  beforeEach(() => {
    setActivePinia(createPinia())
    paints = usePaintsStore()
    pro = useProStore()
    account = useAccountStore()
    analysis = useAnalysisStore()
    account.enabled = true
    account.user = { email: 'a@b.c', plan: null, consent: true }
    analysis.picture = { sample: false, hash: 'photo' }
  })

  it('is what a free account mixes from, all twelve on Auto', () => {
    expect(paints.starter).toBe(true)
    expect(paints.all).toBe(starterPaints)
    expect(paints.autoCandidates).toHaveLength(12)
    expect(paints.enabledIds.size).toBe(12)
    expect(paints.palette.auto).toBe(true)
  })

  it('keeps its own palette: choosing in it leaves the paints of the user alone', () => {
    const own = [...paints.selection.paintIds]
    paints.toggle('starter-12', false)
    expect(paints.enabledIds.has('starter-12')).toBe(false)
    expect(paints.selection.paintIds).toEqual(own)
    paints.reset()
    expect(paints.enabledIds.size).toBe(12)
  })

  it('gives way to the own paints on a sample, an unlocked picture and with a plan', () => {
    analysis.picture = { sample: true, hash: null }
    expect(paints.starter).toBe(false)
    analysis.picture = { sample: false, hash: 'photo' }
    account.unlocks = [{ hash: 'photo', at: 1 }]
    expect(paints.starter).toBe(false)
    expect(pro.can('print')).toBe(true)
    expect(pro.can('paint_boxes')).toBe(false)
    account.unlocks = []
    account.user = { ...account.user, plan: 'subscription' }
    expect(paints.starter).toBe(false)
    expect(pro.active).toBe(true)
  })

  it('opens the dialog with the feature asked for, and says whether a credit helps', () => {
    expect(pro.require('print', 'print or save a PDF')).toBe(false)
    expect(pro.offered).toBe(true)
    expect(pro.feature).toBe('print')
    expect(pro.creditHelps()).toBe(true)
    pro.require('brand_charts', 'add colours')
    expect(pro.creditHelps()).toBe(false)
    expect(pro.require('save', 'save', true)).toBe(true)
  })

  it('switches Monochrome off without Pro, also for a picture saved with it', () => {
    analysis.settings.values = true
    expect(analysis.valueMode).toBe(false)
    account.user = { ...account.user, plan: 'lifetime' }
    expect(analysis.valueMode).toBe(true)
  })
})
