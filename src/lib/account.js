// Accounts: when the app asks for one, and what comes back in the address after signing in or paying.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/

/**
 * Whether the app asks to sign in. Without an API there are no accounts. On a development host
 * (localhost, *.test) the app opens without signing in, unless the address carries "?login".
 * @param {string} api  address of the account API, or empty
 * @param {{ hostname: string, search: string }} location
 */
export function accountsWanted(api, location) {
  if (!api) return false
  if (new URLSearchParams(location.search).has('login')) return true
  return !LOCAL_HOST.test(location.hostname)
}

const NOTICES = {
  'login=failed': { kind: 'error', text: 'Signing in did not work. Please try again.' },
  'login=no-email': { kind: 'error', text: 'That account shares no e-mail address. Please sign in another way.' },
  'billing=ok': { kind: 'paid', text: 'Thank you. Your purchase is being confirmed.' },
  'billing=cancelled': { kind: 'info', text: 'The payment was not completed. Nothing was charged.' },
}

/**
 * What the fragment of the address says after coming back to the app.
 * @param {string} hash  location.hash
 * @returns {{ magic?: string, signedIn?: boolean, notice?: { kind: string, text: string }, handled: boolean }}
 *   `signedIn`: the visitor has just signed in (a sign-in link or a provider).
 */
export function readReturn(hash) {
  const fragment = hash.replace(/^#/, '')
  const magic = /^magic=([0-9a-f]{64})$/.exec(fragment)
  if (magic) return { magic: magic[1], signedIn: true, handled: true }
  if (fragment === 'login=ok') return { signedIn: true, handled: true }
  if (NOTICES[fragment]) return { notice: NOTICES[fragment], handled: true }
  return { handled: false }
}

/** "until 3 March 2027" for a subscription paid up to a time in seconds, or an empty string. */
export function paidUntil(seconds, locale = 'en-GB') {
  if (!seconds) return ''
  return new Date(seconds * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
