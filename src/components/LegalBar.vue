<template>
  <!-- Imprint, privacy, terms and cookies (until 2026-10-23 always shown at the bottom of the
       window): a row that slides in below the bottom bar, centred. On a phone it comes with the
       menu, so every page is two taps away; in a wide window with the info button of the left
       column (App.vue), and a touch anywhere else or Escape closes it again. -->
  <nav ref="root" class="legal" :class="{ 'legal--open': open, 'legal--menu': menu }" :aria-label="t('Imprint & privacy')">
    <a class="legal__link" :href="legalPage('imprint')">{{ t('Imprint') }}</a>
    <a class="legal__link" :href="legalPage('privacy')">{{ t('Privacy') }}</a>
    <a class="legal__link" :href="legalPage('terms')">{{ t('Terms') }}</a>
    <button v-if="consent.available" class="legal__link" type="button" @click="reviewCookies">{{ t('Cookies') }}</button>
  </nav>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useConsentStore } from '../stores/consent.js'
import { useText } from '../i18n/index.js'

const props = defineProps({
  // Opened with the info button.
  open: { type: Boolean, default: false },
  // The menu of a phone is open (the row only follows it in a narrow window, legal.scss).
  menu: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])
const { t, legalPage } = useText()
const consent = useConsentStore()
const root = ref(null)

function close() {
  emit('update:open', false)
}
function reviewCookies() {
  close()
  consent.review()
}

// The info button toggles the row itself, so a touch on it does not count as outside.
function outside(event) {
  if (!root.value?.contains(event.target) && !event.target.closest?.('.app__legal-toggle')) close()
}
function escape(event) {
  if (event.key === 'Escape') close()
}
function listen(on) {
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', outside, true)
  document[method]('keydown', escape)
}
watch(() => props.open, listen)
onBeforeUnmount(() => listen(false))
</script>
