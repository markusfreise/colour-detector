<template>
  <main class="gate">
    <!-- Behind it the app at work: the watercolour as numbered areas mixed from three paints, then
         the samples in turn; the recipe of a colour follows the pointer. Each photo fades in over
         the last rendering, then gives way to its own. Until the first rendering is there, the
         watercolour itself pulses: the picture, and the same one turned almost upside down and
         multiplied onto it. -->
    <div class="gate__backdrop" aria-hidden="true">
      <img class="gate__layer" :src="background" alt="" />
      <img class="gate__layer gate__layer--turned" :src="background" alt="" />
      <PaintingCanvas v-if="showing" class="gate__map" :class="{ 'gate__map--shown': mapShown }" backdrop />
      <!-- Always in the page, so that every photo fades in, the first one too. -->
      <img class="gate__photo" :class="{ 'gate__photo--shown': photoShown }" :src="photo ?? undefined" alt="" />
    </div>
    <!-- Once the link is sent, the card is only the logo, the message and the links at the bottom. -->
    <section class="card panel gate__card" :class="{ 'gate__card--sent': account.sentTo && !account.user }" aria-labelledby="gate-title">
      <!-- The language, before anything else is read. Each under its own name. -->
      <div class="gate__languages" role="group" :aria-label="t('Language')">
        <button
          v-for="language in ['en', 'de']"
          :key="language"
          class="gate__language"
          :class="{ 'gate__language--active': preferences.locale === language }"
          type="button"
          :lang="language"
          :aria-pressed="preferences.locale === language"
          :title="language === 'de' ? 'Deutsch' : 'English'"
          @click="preferences.set({ language })"
        >
          {{ language.toUpperCase() }}
        </button>
      </div>
      <div class="gate__main">
      <!-- The logo in the colour of the text, so it reads in light and dark. -->
      <h1 id="gate-title" class="gate__title">
        <span class="gate__logo" role="img" :aria-label="APP_NAME" v-html="logo"></span>
      </h1>
      <p v-if="account.notice" class="gate__notice" :class="{ 'gate__notice--error': account.notice.kind === 'error' }">
        {{ account.notice.text }}
      </p>

      <p v-if="!account.loaded" class="gate__text">{{ t('One moment…') }}</p>

      <!-- Signed in: the two statements the app needs before it opens. -->
      <template v-else-if="account.user">
        <p class="gate__text">{{ t('Signed in as') }} <strong>{{ account.user.email }}</strong>{{ t('. Before you start:') }}</p>
        <label class="checkbox gate__check">
          <input v-model="privacy" type="checkbox" />
          <span>
            {{ t('I have read the') }} <a :href="legalPage('privacy')" target="_blank" rel="noopener">{{ t('privacy policy') }}</a> {{ t('and the') }}
            <a :href="legalPage('terms')" target="_blank" rel="noopener">{{ t('terms') }}</a> {{ t('and agree to them.') }}
          </span>
        </label>
        <label class="checkbox gate__check">
          <input v-model="local" type="checkbox" />
          <span>
            {{
              t(
                "I understand that my pictures, paint boxes and collection are stored only in this browser on this device and not in the cloud. They are not part of my account, and they are gone if I clear the browser's data.",
              )
            }}
          </span>
        </label>
        <div class="gate__actions">
          <button class="button" type="button" :disabled="!privacy || !local || account.busy" @click="account.agree()">{{ t('Continue') }}</button>
          <button class="button button--ghost" type="button" :disabled="account.busy" @click="account.signOut()">{{ t('Sign out') }}</button>
        </div>
      </template>

      <template v-else>
        <div v-if="buttons.length && !account.sentTo" class="gate__providers">
          <button v-for="p in buttons" :key="p.id" class="button button--secondary gate__provider" type="button" @click="account.signInWith(p.id)">
            <span v-if="p.id !== 'meta'" :class="['gate__mark', `gate__mark--${p.id}`]" aria-hidden="true"></span>
            {{ t('Continue with {name}', { name: p.name }) }}
          </button>
        </div>
        <p v-if="account.sentTo && account.testLink" class="gate__text">
          {{ t('Local test, no mail sent. The sign-in link for') }} <strong>{{ account.sentTo }}</strong>:
          <a :href="account.testLink">{{ account.testLink }}</a>
        </p>
        <p v-else-if="account.sentTo" class="gate__text">
          {{ t('A sign-in link is on its way to') }} <strong>{{ account.sentTo }}</strong>{{ t('. Open it on this device; it works for 15 minutes.') }}
        </p>
        <div v-if="account.sentTo" class="gate__actions">
          <button class="button" type="button" @click="account.sentTo = ''">{{ t('Use different address') }}</button>
        </div>
        <!-- Signing in and signing up are the same link by e-mail; the second form is there for
             people who look for one. Only signing up asks for an invitation code. -->
        <!-- The address, the button, and the way to the other form; the placeholder says what goes
             in, the label is only for screen readers. -->
        <form v-else-if="!signingUp" class="gate__form" @submit.prevent="account.sendLink(email)">
          <input v-model.trim="email" class="input gate__email" type="email" required autocomplete="email" :aria-label="t('Sign in with e-mail')" :placeholder="t('Your e-mail address')" />
          <button class="button button--secondary gate__submit" type="submit" :disabled="account.busy || !email">{{ t('Get a sign-in link') }}</button>
          <button class="gate__link gate__switch" type="button" @click="signingUp = true">{{ t('Sign up for free') }}</button>
        </form>
        <form v-else class="gate__form" @submit.prevent="account.sendLink(email, code)">
          <input v-model.trim="email" class="input gate__email" type="email" required autocomplete="email" :aria-label="t('Sign up for free')" :placeholder="t('Your e-mail address')" />
          <!-- Optional: a code unlocks everything for good. Without one the account is a free one. -->
          <label v-if="account.invitation" class="field gate__field">
            <span class="field__label">{{ t('Invitation code (optional)') }}</span>
            <input v-model.trim="code" class="input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
          </label>
          <button class="button button--secondary gate__submit" type="submit" :disabled="account.busy || !email">{{ t('Create my account') }}</button>
          <button class="gate__link gate__switch" type="button" @click="signingUp = false">{{ t('Sign in with account') }}</button>
        </form>

        <!-- Below the form: the early bird of plans.json until its last day, then the Pro version
             and the manual side by side. -->
        <template v-if="!account.sentTo">
          <p v-if="earlyBird" class="gate__offer">
            <strong class="gate__offer-percent">{{ early.percent_off }}%</strong>
            <span class="gate__offer-terms">{{ t('off yearly and lifetime') }}<br />{{ t('early bird until 30 Nov 2026') }}</span>
          </p>
          <div class="gate__more">
            <a class="button gate__more-link" :href="legalPage('pricing')" target="_blank" rel="noopener">{{ t('Pro version') }}</a>
            <a class="button gate__more-link" :href="legalPage('manual')" target="_blank" rel="noopener">{{ t('Manual') }}</a>
          </div>
        </template>
      </template>

      <p v-if="account.error" class="gate__error">{{ account.error }}</p>
      <p v-if="account.loaded && !account.user && account.error" class="gate__actions">
        <button class="button button--ghost" type="button" @click="account.refresh()">{{ t('Try again') }}</button>
      </p>
      </div>

      <!-- What the app does: one sentence, the three steps, and a desk with the printed result. -->
      <aside v-if="!account.sentTo || account.user" class="gate__how" aria-labelledby="how-title">
        <h2 id="how-title" class="gate__how-title">{{ t('The app that shows you how to mix the right watercolours for your pictures.') }}</h2>
        <ol class="gate__steps">
          <li v-for="step in steps" :key="step" class="gate__step">{{ t(step) }}</li>
        </ol>
        <img class="gate__image" :src="signinImage" :alt="t('A watercolour palette beside the printed colour cards and the picture as numbered areas')" />
      </aside>

      <!-- Below both columns, in one row. -->
      <footer class="gate__footer">
        <a v-if="!isNative" :href="legalPage('manual')">{{ t('Manual') }}</a>
        <a :href="legalPage('pricing')">{{ t('Prices') }}</a>
        <a :href="legalPage('privacy')">{{ t('Privacy') }}</a>
        <a :href="legalPage('terms')">{{ t('Terms') }}</a>
        <a :href="legalPage('imprint')">{{ t('Imprint') }}</a>
        <button v-if="consent.available" class="gate__settings" type="button" @click="consent.review()">{{ t('Cookies') }}</button>
        <DebugMenu link />
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { useAnalysisStore, SAMPLES } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { showcasePaints } from '../data/showcase.js'
import PaintingCanvas from './PaintingCanvas.vue'
import DebugMenu from './DebugMenu.vue'
import { APP_NAME } from '../config.js'
import { PLANS } from '../lib/entitlements.js'
import logoSvg from '../../resources/logo.svg?raw'
import background from '../../resources/background.webp'
import signinImage from '../../resources/howto/signin.webp'
import { useConsentStore } from '../stores/consent.js'
import { usePreferencesStore } from '../stores/preferences.js'
import { useText } from '../i18n/index.js'
import { isNative } from '../lib/native.js'

const { t, legalPage } = useText()
const consent = useConsentStore()
const preferences = usePreferencesStore()
const steps = ['Add a reference photo for your picture', 'Add your watercolours', 'Let the app analyse the mixes']

const account = useAccountStore()
// The early-bird offer runs until the end of its last day, Berlin time.
const early = PLANS.early_bird
const earlyBird = !!early?.active && Date.now() <= Date.parse(`${early.ends}T23:59:59+01:00`)
const logo = logoSvg.replace(/fill="black"/g, 'fill="currentColor"')
const email = ref('')
const code = ref('')
const signingUp = ref(false)
// The debug menu chooses between signing in and signing up.
watch(
  () => account.preview,
  (screen) => {
    if (screen === 'signin' || screen === 'signup') signingUp.value = screen === 'signup'
  },
  { immediate: true },
)
const privacy = ref(false)
const local = ref(false)

const NAMES = { google: 'Google', apple: 'Apple', meta: 'Facebook' }
// The providers the server has keys for, in a fixed order.
const buttons = computed(() => ['google', 'apple', 'meta'].filter((id) => account.providers.includes(id)).map((id) => ({ id, name: NAMES[id] })))

// The showcase: a rendering, a few seconds to look at it, the next photo fading in over it, and
// that photo giving way to its own rendering. It runs while the gate is open for somebody who is
// not signed in or has not agreed yet; signing in ends it, and the app opens its own sample with
// the user's paints (App.vue).
const DWELL = 6000 // a rendering on its own
const FADE = 2500 // as long as the fades in gate.scss
const HOLD = 1240 // the photo fully there, at the least
const analysis = useAnalysisStore()
const paints = usePaintsStore()
const showing = ref(false)
const mapShown = ref(false)
const photo = ref(null)
const photoShown = ref(false)
let running = false
let timer = null

const shuffled = (list) => {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
const pause = (ms) => new Promise((resolve) => (timer = setTimeout(resolve, ms)))
// Until what has just changed is on screen.
const painted = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
// A photo is shown only once it is loaded, so that it fades in whole.
const ready = (url) => new Promise((resolve) => {
  const img = new Image()
  img.onload = img.onerror = () => resolve()
  img.src = url
})

async function showcase() {
  running = true
  showing.value = true
  paints.startShowcase(showcasePaints)
  analysis.settings.mode = 'mix'
  // The first rendering takes over from the pulsing watercolour.
  await analysis.loadFromSource(background, 'Watercolour', { sample: true, hash: null })
  if (!running) return
  mapShown.value = true
  let previous = background
  while (running) {
    // The samples of the site in an order of their own each round, the watercolour among them again.
    const round = shuffled([{ url: background, name: 'Watercolour' }, ...SAMPLES.filter((s) => !s.local)])
    for (const picture of round) {
      if (picture.url === previous) continue
      await pause(DWELL)
      if (!running) return
      await ready(picture.url)
      photo.value = picture.url
      // The new source has to be in place before the fade starts.
      await painted()
      photoShown.value = true
      // The rendering before stays under the photo until the photo covers it completely; only
      // then is the new one made, and the photo gives way once it is drawn, not before HOLD.
      await pause(FADE)
      if (!running) return
      await Promise.all([pause(HOLD), analysis.loadFromSource(picture.url, picture.name, { sample: true, hash: null }).then(painted)])
      if (!running) return
      photoShown.value = false
      previous = picture.url
    }
  }
}

function stopShowcase() {
  running = false
  clearTimeout(timer)
  if (!paints.showcase) return
  // Its colours name the showcase paints: the picture goes with them.
  analysis.clearPicture()
  paints.endShowcase()
}

// Only once it is known who is there: a signed-in user goes straight to the app.
watch(
  () => account.loaded && !account.ready,
  (gate) => {
    if (gate && !running) showcase()
  },
  { immediate: true },
)
onBeforeUnmount(stopShowcase)
</script>
