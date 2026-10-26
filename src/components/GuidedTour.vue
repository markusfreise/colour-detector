<template>
  <!-- The guided tour: the buttons of one step outlined, the rest of the window dimmed, a card beside
       them. The app stays usable underneath; only the card takes clicks. -->
  <div v-if="tour.step !== null" class="tour" role="dialog" :aria-label="t('Tour')" @keydown.esc="tour.end()">
    <div v-if="spot" class="tour__spot" :style="spotStyle" aria-hidden="true"></div>
    <div ref="card" class="tour__card" :style="cardStyle">
      <p class="tour__count">{{ tour.step + 1 }} / {{ steps.length }}</p>
      <h2 class="tour__title">{{ t(step.title) }}</h2>
      <p class="tour__text">
        {{ t(step.text) }}
        <a v-if="step.manual && !isNative" class="tour__link" :href="legalPage('manual')" target="_blank" rel="noopener">{{ t('Open the manual') }}</a>
      </p>
      <div class="tour__buttons">
        <button class="tour__skip" type="button" @click="tour.end()">{{ last ? t('Close') : t('Skip tour') }}</button>
        <button ref="next" class="button button--secondary tour__next" type="button" @click="tour.next(steps.length)">{{ last ? t("Let's paint") : t('Next') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTourStore } from '../stores/tour.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useAccountStore } from '../stores/account.js'
import { useLayoutStore } from '../stores/layout.js'
import { PHONE } from '../config.js'
import { placeCard, unionRect } from '../lib/tour.js'
import { isNative } from '../lib/native.js'
import { useText } from '../i18n/index.js'

const { t, legalPage } = useText()
const tour = useTourStore()
const analysis = useAnalysisStore()
const account = useAccountStore()
const layout = useLayoutStore()

// Each step points at what `targets` finds: the first selector with something visible. On a phone
// the picture buttons are folded behind the menu button, which stands in for them.
const steps = computed(() => [
  {
    targets: ['[data-tour="photo"]', '.app__burger'],
    title: 'First choose a photo',
    // Only with accounts is there something to unlock; the first photo of one's own is free.
    text: account.enabled
      ? 'Try one of the samples, where everything is unlocked, or load a reference photo of your own: the first one is free.'
      : 'Try one of the samples, or load a reference photo of your own.',
  },
  {
    targets: ['[data-tour="paints"]'],
    title: 'Now choose your paints',
    text: 'Pick the paints you want to use, or leave it on Auto and the app chooses them from your paint box.',
  },
  {
    targets: ['[data-tour="settings"]'],
    title: 'Adjust the settings',
    text: 'Set them to the way you work: how many colours, how simple the areas, mixing or layers.',
  },
  {
    targets: ['.painting__canvas'],
    title: 'Find the recipes',
    text: 'Hover over an area, or tap it, to see the recipe for its colour. Print or export the sheet to paint away from the screen. Have fun painting!',
    manual: true,
  },
])
const step = computed(() => steps.value[tour.step ?? 0])
const last = computed(() => tour.step === steps.value.length - 1)

const visible = (el) => el.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? el.offsetParent !== null
function targetRect() {
  for (const selector of step.value.targets) {
    const rects = [...document.querySelectorAll(selector)].filter(visible).map((el) => el.getBoundingClientRect())
    const rect = unionRect(rects)
    if (rect) return rect
  }
  return null
}

// Where things are, read every frame while the tour is open: panels move, pictures load, the
// window turns.
const spot = ref(null)
const cardBox = ref({ left: 0, top: 0 })
const card = ref(null)
const next = ref(null)
let frame = 0
function follow() {
  const rect = targetRect()
  spot.value = rect
  if (card.value) {
    const size = { width: card.value.offsetWidth, height: card.value.offsetHeight }
    cardBox.value = placeCard(rect && { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }, size, { width: window.innerWidth, height: window.innerHeight })
  }
  frame = requestAnimationFrame(follow)
}
const PAD = 6
const spotStyle = computed(() => spot.value && { left: `${spot.value.left - PAD}px`, top: `${spot.value.top - PAD}px`, width: `${spot.value.width + 2 * PAD}px`, height: `${spot.value.height + 2 * PAD}px` })
const cardStyle = computed(() => ({ left: `${cardBox.value.left}px`, top: `${cardBox.value.top}px` }))

watch(
  () => tour.step,
  async (now, before) => {
    cancelAnimationFrame(frame)
    if (now === null) return
    await nextTick()
    follow()
    if (before === null) next.value?.focus()
  },
)
// On a phone the settings card covers the buttons the tour points at: it stays folded, except in
// the step about the settings, where it is opened with the button pointed at.
watch(
  () => [tour.step, layout.collapsed.controls],
  ([now, folded]) => {
    if (now !== null && now !== 2 && !folded && window.matchMedia(PHONE).matches) layout.collapsed.controls = true
  },
)
// The first step is done as soon as a picture is there.
watch(
  () => analysis.image,
  (image) => {
    if (image && tour.step === 0) tour.next(steps.value.length)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>
