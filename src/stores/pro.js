import { defineStore } from 'pinia'
import { isNative, onNative, sendNative } from '../lib/native.js'
import { useAccountStore } from './account.js'

// What the free version includes; a purchase lifts the limits.
// The app from the App Store keeps one picture for free; a free account in the browser saves none.
export const FREE_IMAGES = isNative ? 1 : 0
// A free account mixes from at most this many paints, and does not print.
export const FREE_PAINTS = 8

export const useProStore = defineStore('pro', {
  state: () => ({
    unlocked: false,
    price: null, // localised price from the App Store, e.g. "4,99 €"
    busy: false,
    offered: false, // purchase dialog open
    reason: '', // what the user tried to do when the dialog opened
    error: null,
  }),
  getters: {
    // In the app the App Store decides. In the browser the account does; without accounts nothing is locked.
    active(state) {
      if (isNative) return state.unlocked
      const account = useAccountStore()
      return !account.enabled || account.pro
    },
    // How many paints a paint box may use: all of them once unlocked. Only accounts in the browser have this limit.
    paintLimit() {
      return isNative || this.active ? Infinity : FREE_PAINTS
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
    /** True when the feature may be used; otherwise opens the purchase dialog. */
    require(allowed, reason) {
      if (this.active || allowed) return true
      this.reason = reason
      this.error = null
      this.offered = true
      return false
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
