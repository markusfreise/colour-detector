// The debug menu: on development hosts, and anywhere once the address has carried "?debug".
// It only changes what this browser shows; the account API decides for itself.

const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$|(^|\.)croeso\.de$/
const KEY = 'colour-detector:debug'

/**
 * Whether the debug menu is shown.
 * @param {{ hostname: string, search: string }} location
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void }|null} storage  sessionStorage
 */
export function debugWanted(location, storage = null) {
  if (DEV_HOST.test(location.hostname)) return true
  if (new URLSearchParams(location.search).has('debug')) {
    try {
      storage?.setItem(KEY, '1')
    } catch {
      // Not kept: the menu lasts as long as the address carries "?debug".
    }
    return true
  }
  try {
    return storage?.getItem(KEY) === '1'
  } catch {
    return false
  }
}
