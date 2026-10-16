<template>
  <!-- With accounts on, the app opens after signing in and agreeing to the two statements. Until
       then only the sign-in is loaded: the app itself is sent to signed-in users only (api/app/). -->
  <AccountGate v-if="!account.ready" />
  <component :is="app" v-else-if="app" />
  <p v-else-if="failed" class="app__notice">
    {{ t('The app could not be loaded. Please reload the page.') }}
  </p>
  <!-- Over the app and over the sign-in alike. -->
  <ConsentBanner />
</template>

<script setup>
import { markRaw, onMounted, ref, shallowRef, watch } from 'vue'
import AccountGate from './components/AccountGate.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import { useAccountStore } from './stores/account.js'
import { useConsentStore } from './stores/consent.js'
import { useText } from './i18n/index.js'

const { t } = useText()
const account = useAccountStore()
const app = shallowRef(null)
const failed = ref(false)

watch(
  () => account.ready,
  async (ready) => {
    if (!ready || app.value) return
    try {
      app.value = markRaw((await import('./App.vue')).default)
    } catch {
      // The session ended between asking who is signed in and fetching the app.
      failed.value = true
      account.refresh()
    }
  },
  { immediate: true },
)
onMounted(() => {
  useConsentStore().init()
  account.init()
})
</script>
