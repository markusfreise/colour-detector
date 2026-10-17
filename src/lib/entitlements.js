// What an account may use, for every gate in the app. The rules come from server/plans.json, which
// the account API reads too (server/entitlements.php), so both sides decide alike.
import plans from '../../server/plans.json'

export const PLANS = plans

/** The group a feature belongs to: 'picture', 'studio', or null for one that is not gated. */
export function featureGroup(feature, config = PLANS) {
  for (const [group, features] of Object.entries(config.features)) if (features.includes(feature)) return group
  return null
}

/**
 * Whether `feature` may be used.
 * @param {object} state
 * @param {boolean} [state.open]  no accounts in this build or on this host: nothing is locked
 * @param {boolean} [state.native]  inside the app from the App Store, which has its own purchase
 * @param {boolean} [state.nativeUnlocked]  that purchase is made
 * @param {'subscription'|'lifetime'|null} [state.plan]  a plan of the account, paid or as a licence
 * @param {Set<string>} [state.unlocked]  hashes of the pictures unlocked with a credit
 * @param {{ hash?: string|null, sample?: boolean }} [state.picture]  the picture on screen
 */
export function canUse(state, feature, config = PLANS) {
  const group = featureGroup(feature, config)
  if (!group) throw new Error(`Unknown feature: ${feature}`)
  if (state.open) return true
  // The App Store purchase unlocks everything; without it the app locks what it always locked.
  if (state.native) return Boolean(state.nativeUnlocked) || !config.native.locked.includes(feature)
  if (state.plan === 'subscription' || state.plan === 'lifetime') return true
  if (group === 'studio') return false
  const picture = state.picture
  if (!picture) return false
  if (picture.sample && config.free.samples_unlocked) return true
  return Boolean(picture.hash && state.unlocked?.has(picture.hash))
}

/** Pictures a free account may keep in its collection. */
export const freeSavedPictures = (native, config = PLANS) => (native ? config.free.saved_pictures_native : config.free.saved_pictures)

/** The products on offer, in their order. */
export const activeProducts = (config = PLANS) => config.products.filter((p) => p.active).sort((a, b) => a.sort - b.sort)
