<template>
  <main class="gate">
    <section class="panel gate__card" aria-labelledby="gate-title">
      <!-- The logo in the colour of the text, so it reads in light and dark. -->
      <h1 id="gate-title" class="gate__title">
        <span class="gate__logo" role="img" :aria-label="APP_NAME" v-html="logo"></span>
      </h1>
      <p v-if="account.notice" class="gate__notice" :class="{ 'gate__notice--error': account.notice.kind === 'error' }">
        {{ account.notice.text }}
      </p>

      <p v-if="!account.loaded" class="gate__text">One moment…</p>

      <!-- Signed in: the two statements the app needs before it opens. -->
      <template v-else-if="account.user">
        <p class="gate__text">Signed in as <strong>{{ account.user.email }}</strong>. Before you start:</p>
        <label class="checkbox gate__check">
          <input v-model="privacy" type="checkbox" />
          <span>I have read the <a href="privacy/" target="_blank" rel="noopener">privacy policy</a> and the <a href="terms/" target="_blank" rel="noopener">terms</a> and agree to them.</span>
        </label>
        <label class="checkbox gate__check">
          <input v-model="local" type="checkbox" />
          <span>
            I understand that my pictures, paint boxes and collection are stored only in this browser on this device and not in
            the cloud. They are not part of my account, and they are gone if I clear the browser's data.
          </span>
        </label>
        <div class="gate__actions">
          <button class="button" type="button" :disabled="!privacy || !local || account.busy" @click="account.agree()">Continue</button>
          <button class="button button--ghost" type="button" :disabled="account.busy" @click="account.signOut()">Sign out</button>
        </div>
      </template>

      <template v-else>
        <p class="gate__text">
          Sign in to use the app. Your account is only your e-mail address; your pictures stay in this browser and are never uploaded.
        </p>
        <div v-if="buttons.length" class="gate__providers">
          <button v-for="p in buttons" :key="p.id" class="button button--secondary gate__provider" type="button" @click="account.signInWith(p.id)">
            Continue with {{ p.name }}
          </button>
        </div>
        <p v-if="account.sentTo" class="gate__text">
          A sign-in link is on its way to <strong>{{ account.sentTo }}</strong>. Open it on this device; it works for 15 minutes.
          <button class="gate__link" type="button" @click="account.sentTo = ''">Use another address</button>
        </p>
        <form v-else class="gate__form" @submit.prevent="account.sendLink(email)">
          <label class="field gate__field">
            <span class="field__label">{{ buttons.length ? 'Or with a link by e-mail' : 'Your e-mail address' }}</span>
            <input v-model.trim="email" class="input" type="email" required autocomplete="email" placeholder="you@example.org" />
          </label>
          <button class="button" type="submit" :disabled="account.busy || !email">Send me a sign-in link</button>
        </form>
      </template>

      <p v-if="account.error" class="gate__error">{{ account.error }}</p>
      <p v-if="account.loaded && !account.user && account.error" class="gate__actions">
        <button class="button button--ghost" type="button" @click="account.refresh()">Try again</button>
      </p>
      <footer class="gate__footer">
        <a href="privacy/">Privacy</a>
        <a href="terms/">Terms</a>
        <a href="imprint/">Imprint</a>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { APP_NAME } from '../config.js'
import logoSvg from '../../resources/logo.svg?raw'

const account = useAccountStore()
const logo = logoSvg.replace(/fill="black"/g, 'fill="currentColor"')
const email = ref('')
const privacy = ref(false)
const local = ref(false)

const NAMES = { google: 'Google', apple: 'Apple', meta: 'Facebook' }
// The providers the server has keys for, in a fixed order.
const buttons = computed(() => ['google', 'apple', 'meta'].filter((id) => account.providers.includes(id)).map((id) => ({ id, name: NAMES[id] })))
</script>
