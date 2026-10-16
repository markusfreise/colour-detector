// The way to the mixing service (api/mix/, see mixService.js): recipes, mixes and the plan of the
// layers come from the server, from the colours of the picture and the paints. The picture stays
// in the browser.

/** A failed request; `status` 0 = the server could not be reached. */
export class MixError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// Requests larger than this go compressed, where the browser can do it.
const COMPRESS_FROM = 16384

/** One request to the service at `url` (absolute, or relative to the page). */
export async function postMix(url, body) {
  const json = JSON.stringify(body)
  const headers = { 'Content-Type': 'application/json' }
  let payload = json
  if (json.length > COMPRESS_FROM && typeof CompressionStream === 'function') {
    payload = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    headers['Content-Encoding'] = 'gzip'
  }
  let response
  try {
    response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers, body: payload })
  } catch {
    throw new MixError('The mixing service cannot be reached. Check the connection.', 0)
  }
  const answer = await response.json().catch(() => null)
  if (!response.ok) throw new MixError(answer?.error ?? 'The mixing service did not answer as expected.', response.status)
  return answer
}

let base = 'api'
let transport = (route, body) => postMix(`${base}/mix/${route}`, body)

/** Where the service answers ("api" next to the app). */
export function setMixBase(url) {
  base = url
}

/** The address of a route of the service, absolute: a worker resolves addresses against its own. */
export function mixUrl(route) {
  const path = `${base}/mix/${route}`
  return globalThis.location ? new URL(path, globalThis.location.href).href : path
}

/** Tests answer with the reference in mixService.js instead of the server. */
export function setMixTransport(fn) {
  transport = fn
  cache.clear()
}

// The same question gets the same answer: the last answers are kept, so that going back to a
// setting or a mode does not ask again.
const cache = new Map()
const CACHE_SIZE = 48

/** Asks the service (`route`: propose, plan, recipes). */
export function mix(route, body) {
  const key = `${route} ${JSON.stringify(body)}`
  let answer = cache.get(key)
  if (answer) {
    cache.delete(key)
  } else {
    answer = transport(route, body)
    // A failed request is not kept: the next try asks again.
    Promise.resolve(answer).catch(() => cache.get(key) === answer && cache.delete(key))
  }
  cache.set(key, answer)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  return Promise.resolve(answer)
}
