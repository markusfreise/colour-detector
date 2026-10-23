<template>
  <!-- The colour of the area tapped in the picture: which one it is, how much of the picture it
       covers, and the recipe to mix it. The whole breakdown opens from here. The card lies over
       the picture and is moved up and down by its handle; where it was put is remembered. -->
  <aside v-if="entry" ref="card" class="inspector" :class="{ 'inspector--dragging': dragging }" :style="style" :aria-label="t('The colour tapped in the picture')">
    <div class="flyout__handle" :title="wide ? t('Drag to move the colour') : t('Drag to move the colour up or down')" @pointerdown="startDrag"></div>
    <div class="inspector__head">
      <span class="swatch inspector__swatch" :style="{ background: recipe?.hex ?? entry.targetHex }"></span>
      <h2 class="inspector__title">{{ t('Colour {label}', { label: entry.label }) }}</h2>
      <span class="inspector__share">{{ t('{percent}% of image', { percent: share }) }}</span>
      <button class="flyout__close inspector__close" type="button" :title="t('Close')" :aria-label="t('Close the colour')" @click="analysis.inspect(null)">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
    <RecipeLine v-if="recipe" :recipe="recipe" full />
    <p v-else class="inspector__paper">{{ t('No paints selected in the paint box') }}</p>
    <button class="button button--secondary inspector__more" type="button" @click="emit('breakdown')">{{ t('Full breakdown') }}</button>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PHONE } from '../config.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useLayoutStore } from '../stores/layout.js'
import RecipeLine from './RecipeLine.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const emit = defineEmits(['breakdown'])
const analysis = useAnalysisStore()
const layout = useLayoutStore()
const entry = computed(() => analysis.inspectedColour)
// The recommended recipe, as in the colour list and next to the pointer.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
const share = computed(() => Math.round((entry.value?.share ?? 0) * 100) || '<1')

// In a narrow window the card is as wide as the window and only moves up and down. With room
// beside it (not a phone, PHONE as in the stylesheet) it floats free and is dragged anywhere.
const card = ref(null)
const dragging = ref(false)
const wide = ref(!window.matchMedia(PHONE).matches)
let grip = { x: 0, y: 0 }
const style = computed(() => {
  const at = layout.positions.inspector
  if (!at) return null
  return wide.value && at.x != null
    ? { top: `${at.y}px`, bottom: 'auto', left: `${at.x}px`, transform: 'none' }
    : { top: `${at.y}px`, bottom: 'auto' }
})

// The gap of the design, in pixels, however it is written in the stylesheet.
function margin() {
  const value = getComputedStyle(card.value).getPropertyValue('--gap').trim()
  const size = parseFloat(value) || 0
  return value.endsWith('rem') ? size * parseFloat(getComputedStyle(document.documentElement).fontSize) : size || 16
}

// A place that keeps the whole card in the window, a gap around it.
function inWindow(x, y) {
  const gap = margin()
  const clamp = (v, room) => Math.round(Math.min(Math.max(gap, v), Math.max(gap, room)))
  const at = { y: clamp(y, window.innerHeight - card.value.offsetHeight - gap) }
  if (x != null) at.x = clamp(x, window.innerWidth - card.value.offsetWidth - gap)
  return at
}

function startDrag(event) {
  if (event.button) return
  const rect = card.value.getBoundingClientRect()
  grip = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.addEventListener('pointermove', drag)
  event.currentTarget.addEventListener('pointerup', endDrag)
  event.currentTarget.addEventListener('pointercancel', endDrag)
  event.preventDefault()
}

function drag(event) {
  const x = wide.value ? event.clientX - grip.x : null
  layout.positions.inspector = inWindow(x, event.clientY - grip.y)
}

function endDrag(event) {
  event.currentTarget.removeEventListener('pointermove', drag)
  event.currentTarget.removeEventListener('pointerup', endDrag)
  event.currentTarget.removeEventListener('pointercancel', endDrag)
  dragging.value = false
  layout.persist()
}

// A smaller window, or another colour with a taller recipe, must not push the card out of sight.
function keepInWindow() {
  wide.value = !window.matchMedia(PHONE).matches
  const at = layout.positions.inspector
  if (at && card.value) layout.positions.inspector = inWindow(wide.value ? at.x : null, at.y)
}
watch(card, (el) => el && keepInWindow(), { flush: 'post' })
watch(recipe, () => card.value && keepInWindow(), { flush: 'post' })
onMounted(() => window.addEventListener('resize', keepInWindow))
onBeforeUnmount(() => window.removeEventListener('resize', keepInWindow))
</script>
