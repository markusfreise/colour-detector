import { ACCOUNT_API } from '../config.js'

// The page sits one folder below the app: a relative API address ("api") is one level up.
export const API = /^(https?:)?\//.test(ACCOUNT_API) ? ACCOUNT_API : `../${ACCOUNT_API || 'api'}`

/** One request to the account API; GET without a body. Throws with the server's message. */
export async function call(path, body) {
  const response = await fetch(`${API}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error ?? `The account service answered ${response.status}.`), { status: response.status })
  return data
}

/** Who may change what, as admin.php decides it: shown before the server refuses. */
export function editable(me, user) {
  if (!me || user.id === me.id || user.role === 'superadmin') return false
  return user.role !== 'admin' || me.superadmin
}

/** The plan of a listed account in words. */
export function planLabel(user) {
  if (user.status === 'unlocked') return 'Unlocked by hand'
  if (user.lifetime) return 'Lifetime licence'
  if (user.plan === 'subscription') return `Subscription (${user.subscription?.status ?? 'active'})`
  return 'Free'
}
