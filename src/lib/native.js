// Bridge to the native app shell (iOS / macOS). In a browser there is no handler and every call is a no-op.
const handler = typeof window !== 'undefined' ? window.webkit?.messageHandlers?.tintmap : null

export const isNative = Boolean(handler)
// 'ios' | 'macos' inside the app, null in a browser.
export const nativePlatform = isNative ? window.__TINTMAP__?.platform ?? 'ios' : null

export function sendNative(type, payload = {}) {
  handler?.postMessage({ type, ...payload })
}

/** Listen for messages from the shell; they arrive as "tintmap:<type>" window events. */
export function onNative(type, callback) {
  if (!isNative) return
  window.addEventListener(`tintmap:${type}`, (event) => callback(event.detail ?? {}))
}
