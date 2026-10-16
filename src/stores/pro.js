import { defineStore } from 'pinia'
import { isNative, onNative, sendNative } from '../lib/native.js'
import { canUse, featureGroup, freeSavedPictures } from '../lib/entitlements.js'
import { useAccountStore } from './account.js'
import { useAnalysisStore } from './analysis.js'

// Pictures a free account keeps: one in the app from the App Store, none in the browser.
export const FREE_IMAGES = freeSavedPictures(isNative)

export const useProStore = defineStore('pro', {
  state: () => ({
    unlocked: false,
    price: null, // localised price from the App Store, e.g. "4,99 €"
    busy: false,
    offered: false, // purchase dialog open
    reason: '', // what the user tried to do when the dialog opened
    feature: null, // the feature asked for, see plans.json
    error: null,
  }),
  getters: {
    /** What the entitlement rules are asked about: the account, the purchase in the app, the picture on screen. */
    entitlement(state) {
      const account = useAccountStore()
      return {
        open: !isNative && !account.enabled,
        native: isNative,
        nativeUnlocked: state.unlocked,
        plan: account.user?.plan ?? null,
        unlocked: new Set(account.unlocks.map((u) => u.hash)),
        picture: useAnalysisStore().picture,
      }
    },
    // Everything unlocked: a plan, the purchase in the app, or a build without accounts.
    active() {
      const e = this.entitlement
      return e.open || (e.native ? e.nativeUnlocked : Boolean(e.plan))
    },
    /** `pro.can('print')`: whether the feature may be used on the picture on screen. */
    can() {
      const e = this.entitlement
      return (feature) => canUse(e, feature)
    },
  },
  actions: {
    init() {
      onNative('store', (detail) => {
        this.unlocked = Boolean(detail.pro)
        if (detail.price) this.price = detail.price
        this.error = detail.error ?? null
        this.busy = false
        if (this.unlocked) this.offered = false
      })
      sendNative('ready')
    },
    /**
     * True when the feature may be used (or `allowed` says so anyway); otherwise opens the dialog
     * that offers what unlocks it. `feature` null asks for everything (the "Get Pro" buttons).
     */
    require(feature, reason, allowed = false) {
      if (allowed || (feature ? this.can(feature) : this.active)) return true
      this.feature = feature
      this.reason = reason
      this.error = null
      this.offered = true
      return false
    },
    /** Whether the dialog may offer a credit: only a picture feature, on a picture. */
    creditHelps() {
      return Boolean(this.feature && featureGroup(this.feature) === 'picture' && this.entitlement.picture)
    },
    purchase() {
      this.busy = true
      this.error = null
      sendNative('purchase')
    },
    restore() {
      this.busy = true
      this.error = null
      sendNative('restore')
    },
    dismiss() {
      this.offered = false
    },
  },
})
