import { defineStore } from 'pinia'
import { ACCOUNT_API } from '../config.js'
import { accountsWanted, readReturn } from '../lib/account.js'
import { t, currentLocale } from '../i18n/index.js'

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
    throw new Error(t('The account service cannot be reached. Please check your connection.'))
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
    plans: [],
    invitation: false, // new accounts need an invitation code
    busy: false,
    error: null,
    notice: null, // { kind, text } after coming back from signing in or paying
    sentTo: '', // the address a sign-in link went to
    testLink: '', // local test: the sign-in link, shown instead of mailed
    open: false, // account dialog
    welcome: false, // just signed in: the plans are offered once the app is open
  }),
  getters: {
    // The app itself may be used: signed in, and both statements agreed to.
    ready: (state) => !state.enabled || Boolean(state.user?.consent),
    pro: (state) => Boolean(state.user?.pro),
  },
  actions: {
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
    },
    async refresh() {
      await this.attempt(async () => {
        const data = await call('me')
        this.user = data.user
        this.providers = data.providers
        this.plans = data.plans
        this.invitation = Boolean(data.invitation)
      }, false)
      this.loaded = true
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
        this.sentTo = ''
        this.testLink = ''
        this.open = false
      }
    },
    async buy(plan) {
      await this.attempt(async () => window.location.assign((await call('billing/checkout', { plan })).url))
    },
    // A voucher for a lifetime licence, made out to the address of this account.
    async redeem(code) {
      return this.attempt(async () => {
        this.user = (await call('billing/voucher', { code })).user
      })
    },
    async manage() {
      await this.attempt(async () => window.location.assign((await call('billing/portal', {})).url))
    },
    exportUrl: () => `${ACCOUNT_API}/export`,
    async remove() {
      if (await this.attempt(() => call('delete', {}))) {
        this.user = null
        this.open = false
        this.notice = { kind: 'info', text: t('Your account is deleted. Pictures and paint boxes saved in this browser are still here.') }
      }
    },
  },
})
