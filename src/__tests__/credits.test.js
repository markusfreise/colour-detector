import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { setActivePinia, createPinia } from 'pinia'
import { sha256Hex, pictureKey, hashOf } from '../lib/picture.js'
import { formatPrice, readReturn } from '../lib/account.js'
import { useAccountStore } from '../stores/account.js'
import { useProStore } from '../stores/pro.js'
import { useAnalysisStore } from '../stores/analysis.js'

const sha = (text) => createHash('sha256').update(text).digest('hex')

describe('picture keys', () => {
  it('hashes the bytes of a photo as they are', async () => {
    expect(await sha256Hex(new TextEncoder().encode('photo'))).toBe(sha('photo'))
    expect(await hashOf(new Blob(['photo']))).toBe(sha('photo'))
  })

  it('makes the key as the account API checks it: SHA-256 of "<salt>:<hash>"', async () => {
    const hash = sha('photo')
    expect(await pictureKey('salt-a', hash)).toBe(sha(`salt-a:${hash}`))
    // The same photo in another account is another key.
    expect(await pictureKey('salt-b', hash)).not.toBe(await pictureKey('salt-a', hash))
    expect(await pictureKey('salt-a', hash)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('prices and returns', () => {
  it('shows a price of Stripe in the language of the app', () => {
    expect(formatPrice({ amount: 899, currency: 'eur' }, 'en-GB')).toBe('€8.99')
    expect(formatPrice({ amount: 899, currency: 'eur' }, 'de-DE')).toMatch(/^8,99\s€$/)
  })

  it('knows the return from paying for pictures', () => {
    expect(readReturn('#billing=pictures').notice.kind).toBe('pictures')
  })
})

describe('account: unlocking a picture with a credit', () => {
  let account, pro, analysis, storage
  const salt = 'a'.repeat(32)
  const hash = sha('photo')
  const user = (over = {}) => ({ email: 'a@b.c', plan: null, consent: true, credits: 1, pictureSalt: salt, unlocks: [], ...over })

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) })
    setActivePinia(createPinia())
    account = useAccountStore()
    pro = useProStore()
    analysis = useAnalysisStore()
    account.enabled = true
    account.user = user()
    analysis.picture = { sample: false, hash }
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends only the key, and unlocks the picture features of that photo', async () => {
    const key = sha(`${salt}:${hash}`)
    const fetch = vi.fn(async (url, options) => ({
      ok: true,
      json: async () => ({ result: 'unlocked', user: user({ credits: 0, unlocks: [{ key, at: 1 }] }), sent: JSON.parse(options.body) }),
    }))
    vi.stubGlobal('fetch', fetch)
    expect(pro.can('own_paints')).toBe(false)
    expect(await account.unlock(hash)).toBe(true)
    expect(fetch.mock.calls[0][0]).toMatch(/credits\/unlock$/)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ key })
    expect(fetch.mock.calls[0][1].body).not.toContain(hash)
    expect(account.credits).toBe(0)
    expect(account.unlockedHashes.has(hash)).toBe(true)
    expect(pro.can('own_paints')).toBe(true)
    expect(pro.can('brand_charts')).toBe(false)
    // Another photo is another picture.
    analysis.picture = { sample: false, hash: sha('other') }
    expect(pro.can('print')).toBe(false)
  })

  it('says when no credits are left', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'No pictures left to unlock.' }) })))
    expect(await account.unlock(hash)).toBe(false)
    expect(account.error).toBe('No pictures left to unlock.')
  })

  it('finds unlocked pictures from their keys, also those of the collection', async () => {
    account.user = user({ unlocks: [{ key: sha(`${salt}:${hash}`), at: 1 }] })
    await account.learnKeys([hash, sha('other'), null])
    expect([...account.unlockedHashes]).toEqual([hash])
    expect(account.unlockedAt(hash)).toBe(1)
    expect(account.unlockedAt(sha('other'))).toBe(null)
  })

  it('keeps the account last told for use without a connection, and forgets it on signing out', async () => {
    const unlocked = user({ credits: 2, unlocks: [{ key: sha(`${salt}:${hash}`), at: 1 }] })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ user: unlocked, providers: [], products: [] }) })))
    await account.refresh()
    expect(account.offline).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    account.user = null
    await account.refresh()
    expect(account.offline).toBe(true)
    expect(account.credits).toBe(2)
    await account.learnKeys([hash])
    expect(pro.can('print')).toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
    await account.signOut()
    expect(storage.has('colour-detector:account')).toBe(false)
  })
})
