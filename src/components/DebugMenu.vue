<template>
  <!-- For testing (lib/debug.js): the full version on or off, the sign-in screens and the plans.
       A button in the left column of the app, and a link in the footer of the sign-in, so that a
       previewed sign-in screen can be left again. Not translated: only for testing. -->
  <!-- Its clicks do not fold the menu of a phone away (App.vue), which would take the card along. -->
  <div v-if="shown" class="debug" :class="{ 'debug--link': link }" @click.stop>
    <!-- In the sign-in footer a word among the links there. -->
    <button v-if="link" class="debug__link" type="button" :aria-expanded="open" @click="open = !open">Debug</button>
    <button v-else class="button debug__toggle" :class="{ 'button--active': open }" type="button" data-hint="Debug" :aria-expanded="open" @click="open = !open">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M8 8a4 4 0 0 1 8 0M7 10h10v4a5 5 0 0 1-10 0zM12 10v9M3 12h4M17 12h4M4 7l3 2M20 7l-3 2M4 18l3-2M20 18l-3-2" />
      </svg>
      <span class="debug__dot" v-if="pro.debugPro !== null || account.preview"></span>
    </button>
    <div v-if="open" class="card debug__card">
      <p class="debug__title">Full version</p>
      <div class="segmented segmented--text">
        <button
          v-for="option in proOptions"
          :key="String(option.value)"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': pro.debugPro === option.value }"
          @click="pro.debugPro = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      <p class="debug__title">Sign-in screens</p>
      <div class="debug__list">
        <button
          v-for="screen in screens"
          :key="String(screen.value)"
          type="button"
          class="button"
          :class="{ 'button--active': account.preview === screen.value }"
          @click="account.showPreview(screen.value)"
        >
          {{ screen.label }}
        </button>
      </div>
      <p class="debug__title">Purchase</p>
      <div class="debug__list">
        <button class="button" type="button" :disabled="!account.ready" @click="pro.require(null, 'use everything', false, true)">Show plans</button>
        <button class="button" type="button" :disabled="!pro.promoHidden" @click="showPromo">Show “Get pro” again</button>
      </div>
      <p class="debug__title">Reset</p>
      <div class="debug__list">
        <button class="button" type="button" :disabled="!account.ready" @click="resetApp">Settings and tour to default</button>
      </div>
      <p class="debug__note">Paint boxes, own paints, the paint selection and saved pictures stay.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { useProStore } from '../stores/pro.js'
import { debugWanted } from '../lib/debug.js'
import { useAnalysisStore, defaultSettings } from '../stores/analysis.js'
import { useLayoutStore } from '../stores/layout.js'
import { useTourStore } from '../stores/tour.js'

const account = useAccountStore()
const pro = useProStore()
defineProps({ link: { type: Boolean, default: false } })
const shown = typeof window !== 'undefined' && debugWanted(window.location, window.sessionStorage)
const open = ref(false)
const proOptions = [
  { value: null, label: 'As bought' },
  { value: true, label: 'Unlocked' },
  { value: false, label: 'Locked' },
]
const screens = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Sign up' },
  { value: 'sent', label: 'Link sent' },
  { value: 'consent', label: 'Agree to terms' },
  { value: null, label: 'Back to the app' },
]

// The settings and the panels as on a first visit, and the tour again; everything about paints stays.
async function resetApp() {
  open.value = false
  const analysis = useAnalysisStore()
  Object.assign(analysis.settings, defaultSettings())
  useLayoutStore().reset()
  useTourStore().reset()
  if (analysis.image) await analysis.analyse()
}
function showPromo() {
  pro.promoHidden = false
  try {
    sessionStorage.removeItem('colour-detector:promo-hidden')
  } catch {
    // Nothing kept.
  }
}
</script>
