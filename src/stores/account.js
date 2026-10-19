import { defineStore } from 'pinia'
import { ACCOUNT_API } from '../config.js'
import { accountsWanted, readReturn } from '../lib/account.js'
import { t, currentLocale } from '../i18n/index.js'
import { pictureKey } from '../lib/picture.js'
import { trackEvent } from '../lib/analytics.js'

// The account as last told by the API, for use without a connection: plan, credits, unlocked pictures.
const CACHE_KEY = 'colour-detector:account'

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeCache(user) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Not kept: without a connection the app asks to sign in again.
  }
}

class Offline extends Error {}

// The balance before paying for a pack, to see when Stripe's confirmation has added to it.
const BEFORE_KEY = 'colour-detector:credits-before'
function creditsBefore() {
  try {
    const before = Number(sessionStorage.getItem(BEFORE_KEY))
    sessionStorage.removeItem(BEFORE_KEY)
    return Number.isFinite(before) ? before : 0
  } catch {
    return 0
  }
}

// One request to the account API. The session travels as a cookie the page cannot read.
async function call(path, body) {
  let response
  try {
    response = await fetch(`${ACCOUNT_API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Offline(t('The account service cannot be reached. Please check your connection.'))
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ? serverText(data.error) : t('The account service did not answer as expected.'))
  return data
}

// A message of the account API in the language shown; the server writes English.
function serverText(message) {
  const voucher = /^This code is not valid for (.+)\. A voucher only works with the address it was made out to\.$/.exec(message)
  if (voucher) return t('This code is not valid for {email}. A voucher only works with the address it was made out to.', { email: voucher[1] })
  return t(message)
}

// The account: who is signed in, what they agreed to and what they paid for. No pictures, no profile.
export const useAccountStore = defineStore('account', {
  state: () => ({
    // False: the app opens without signing in and nothing is locked (no API, or a development host).
    enabled: typeof window !== 'undefined' && accountsWanted(ACCOUNT_API, window.location),
    loaded: false,
    user: null,
    providers: [],
    products: [], // what can be bought: [{ key, type, interval, quantity }], see server/plans.json
    offline: false, // the API could not be reached: `user` is the one last told
    keys: {}, // hash of a photo -> its key in this account (lib/picture.js)
    invitation: false, // new accounts need an invitation code
    impersonatedBy: '', // an admin signed in as this account: their address (server/admin.php)
    busy: false,
    error: null,
    notice: null, // { kind, text } after coming back from signing in or paying
    sentTo: '', // the address a sign-in link went to
    testLink: '', // local test: the sign-in link, shown instead of mailed
    open: false, // account dialog
    welcome: false, // just signed in: the plans are offered once the app is open
    preview: null, // the debug menu shows a sign-in screen: 'signin', 'signup', 'sent' or 'consent'
    previewSaved: null, // what the preview replaced, to put back
  }),
  getters: {
    // The app itself may be used: signed in, and both statements agreed to.
    ready: (state) => !state.preview && (!state.enabled || Boolean(state.user?.consent)),
    pro: (state) => Boolean(state.user?.pro),
    credits: (state) => state.user?.credits ?? 0,
    /** Hashes of the photos unlocked with a credit, as far as their keys are worked out (learnKeys). */
    unlockedHashes(state) {
      const unlocked = new Set((state.user?.unlocks ?? []).map((u) => u.key))
      return new Set(Object.keys(state.keys).filter((hash) => unlocked.has(state.keys[hash])))
    },
    /** When a photo was unlocked, in seconds, or null. */
    unlockedAt(state) {
      return (hash) => (state.user?.unlocks ?? []).find((u) => u.key === state.keys[hash])?.at ?? null
    },
    packs: (state) => state.products.filter((p) => p.type === 'credit_pack'),
  },
  actions: {
    /** The debug menu: shows one of the sign-in screens with made-up data, or (null) the app again. */
    showPreview(screen) {
      if (!this.preview) this.previewSaved = { loaded: this.loaded, user: this.user, sentTo: this.sentTo, invitation: this.invitation, testLink: this.testLink }
      if (!screen) {
        Object.assign(this, this.previewSaved ?? {})
        this.preview = null
        this.previewSaved = null
        return
      }
      this.preview = screen
      this.loaded = true
      this.error = null
      this.testLink = ''
      this.invitation = true
      this.user = screen === 'consent' ? { email: 'test@example.org', consent: false } : null
      this.sentTo = screen === 'sent' ? 'test@example.org' : ''
    },
    async init() {
      if (!this.enabled) return
      // A sign-in link opened in a tab that already shows the app only changes the fragment.
      window.addEventListener('hashchange', () => this.comeBack())
      await this.comeBack()
    },
    // Reads what the address says after signing in or paying, then asks who is signed in.
    async comeBack() {
      const back = readReturn(window.location.hash)
      // The code or result is used once; it should not stay in the address or the history.
      if (this.loaded && !back.handled) return
      if (back.handled) window.history.replaceState(null, '', window.location.pathname + window.location.search)
      if (back.notice) this.notice = { ...back.notice, text: t(back.notice.text) }
      if (back.magic) await this.attempt(() => call('auth/magic/verify', { token: back.magic }))
      await this.refresh()
      if (back.signedIn && this.user) this.welcome = true
      // Stripe confirms a payment a moment after the buyer is back.
      if (back.notice?.kind === 'paid') this.awaitPurchase()
      if (back.notice?.kind === 'pictures') this.awaitCredits(creditsBefore())
    },
    async refresh() {
      await this.attempt(async () => {
        let data
        try {
          data = await call('me')
        } catch (error) {
          // Without a connection the account last told stands in, so unlocked pictures stay open.
          const cached = readCache()
          if (!(error instanceof Offline) || !cached) throw error
          this.user = cached
          this.offline = true
          return
        }
        this.offline = false
        this.user = data.user
        this.providers = data.providers
        this.products = data.products ?? []
        this.invitation = Boolean(data.invitation)
        this.impersonatedBy = data.impersonatedBy ?? ''
        writeCache(this.user)
      }, false)
      this.loaded = true
      await this.learnKeys(Object.keys(this.keys))
    },
    /** Works out the keys of photos in this account, so that their unlocks can be found. */
    async learnKeys(hashes) {
      const salt = this.user?.pictureSalt
      if (!salt) return
      const wanted = [...new Set(hashes.filter(Boolean))]
      const keys = await Promise.all(wanted.map((hash) => pictureKey(salt, hash)))
      if (salt !== this.user?.pictureSalt) return
      this.keys = { ...this.keys, ...Object.fromEntries(wanted.map((hash, i) => [hash, keys[i]])) }
    },
    /** Spends a credit on the photo with this hash; true once it is unlocked. */
    async unlock(hash) {
      if (!hash || !this.user?.pictureSalt) return false
      const key = await pictureKey(this.user.pictureSalt, hash)
      return this.attempt(async () => {
        const data = await call('credits/unlock', { key })
        this.keys = { ...this.keys, [hash]: key }
        this.user = data.user
        writeCache(this.user)
        if (data.result === 'unlocked') trackEvent('credit_unlock', { credits_left: this.credits })
      })
    },
    /** After paying for a pack: Stripe confirms it a moment later. */
    async awaitCredits(before, tries = 8) {
      for (let i = 0; i < tries && this.credits <= before; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await this.refresh()
      }
      if (this.credits > before) {
        trackEvent('pack_purchase', { credits_added: this.credits - before })
        this.notice = { kind: 'info', text: t('Thank you. You can now unlock {n} pictures.', { n: this.credits }) }
      }
    },
    async awaitPurchase(tries = 8) {
      for (let i = 0; i < tries && !this.pro; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await this.refresh()
      }
      if (this.pro) this.notice = { kind: 'info', text: t('Thank you. Everything is unlocked.') }
    },
    // Runs one request with the busy flag and the error shown in the dialogs.
    async attempt(work, clear = true) {
      this.busy = true
      if (clear) this.error = null
      try {
        await work()
        return true
      } catch (error) {
        this.error = error.message
        return false
      } finally {
        this.busy = false
      }
    },
    signInWith(provider) {
      window.location.assign(`${ACCOUNT_API}/auth/${provider}/start`)
    },
    async sendLink(email, code = '') {
      let data
      if (!(await this.attempt(async () => (data = await call('auth/magic', { email, code, lang: currentLocale() }))))) return
      // A local test account is signed in at once.
      if (data.signedIn) {
        await this.refresh()
        this.welcome = true
        return
      }
      this.sentTo = email
      this.testLink = data.link ?? ''
    },
    async agree() {
      await this.attempt(async () => {
        this.user = (await call('consent', { privacy: true, local: true })).user
      })
    },
    async signOut() {
      if (await this.attempt(() => call('logout', {}))) {
        this.user = null
        writeCache(null)
        this.sentTo = ''
        this.testLink = ''
        this.open = false
      }
    },
    async buy(plan) {
      if (this.packs.some((p) => p.key === plan)) {
        try {
          sessionStorage.setItem(BEFORE_KEY, String(this.credits))
        } catch {
          // Then the thank-you comes without waiting for the credits.
        }
      }
      await this.attempt(async () => window.location.assign((await call('billing/checkout', { plan, lang: currentLocale() })).url))
    },
    // A voucher for a lifetime licence, made out to the address of this account.
    async redeem(code) {
      return this.attempt(async () => {
        this.user = (await call('billing/voucher', { code })).user
      })
    },
    async manage() {
      await this.attempt(async () => window.location.assign((await call('billing/portal', { lang: currentLocale() })).url))
    },
    exportUrl: () => `${ACCOUNT_API}/export`,
    adminUrl: () => 'admin/',
    /** Ends signing in as somebody else and goes back to the admin page as the admin. */
    async returnToAdmin() {
      if (await this.attempt(() => call('admin/return', {}))) {
        writeCache(null)
        window.location.href = this.adminUrl()
      }
    },
    async remove() {
      if (await this.attempt(() => call('delete', {}))) {
        this.user = null
        writeCache(null)
        this.open = false
        this.notice = { kind: 'info', text: t('Your account is deleted. Pictures and paint boxes saved in this browser are still here.') }
      }
    },
  },
})
