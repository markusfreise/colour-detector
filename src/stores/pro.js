import { defineStore } from 'pinia'
import { isNative, onNative, sendNative } from '../lib/native.js'

// What the free version includes; the one-time purchase lifts both limits.
export const FREE_BOXES = 1
export const FREE_IMAGES = 1

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
    // There is no shop in the browser, so nothing is locked there.
    active: (state) => !isNative || state.unlocked,
    purchasable: () => isNative,
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
