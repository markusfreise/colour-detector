// What a stored cookie choice is worth. Kept apart from the store so that it can be tested.

// Raise when the banner asks for something new: everybody is asked again.
export const CONSENT_VERSION = 2
// A choice is asked again after 13 months, as data protection authorities recommend.
export const CONSENT_MAX_AGE = 395 * 24 * 60 * 60 * 1000

/**
 * The stored choice if it still holds, otherwise null (ask again).
 * @param {unknown} saved  what localStorage held, parsed
 * @param {number} now     Date.now()
 * @returns {{ analytics: boolean, version: number, at: number } | null}
 */
export function validChoice(saved, now) {
  if (!saved || typeof saved !== 'object') return null
  const { analytics, version, at } = saved
  if (typeof analytics !== 'boolean' || version !== CONSENT_VERSION || typeof at !== 'number') return null
  if (at > now || now - at > CONSENT_MAX_AGE) return null
  return { analytics, version, at }
}
