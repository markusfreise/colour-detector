<template>
  <!-- The colour of the area tapped in the picture: which one it is, how much of the picture it
       covers, and the recipe to mix it. The whole breakdown opens from here. The card lies over
       the picture and is moved up and down by its handle; where it was put is remembered. -->
  <aside v-if="entry" ref="card" class="inspector" :class="{ 'inspector--dragging': dragging }" :style="style" aria-label="The colour tapped in the picture">
    <div class="flyout__handle" title="Drag to move the colour up or down" @pointerdown="startDrag"></div>
    <div class="inspector__head">
      <span class="swatch inspector__swatch" :style="{ background: recipe?.hex ?? entry.targetHex }"></span>
      <h2 class="inspector__title">Colour {{ entry.label }}</h2>
      <span class="inspector__share">{{ share }}% of image</span>
      <button class="flyout__close inspector__close" type="button" title="Close" aria-label="Close the colour" @click="analysis.inspect(null)">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
    <RecipeLine v-if="recipe" :recipe="recipe" full />
    <p v-else class="inspector__paper">No paints selected in the paint box</p>
    <button class="button button--secondary inspector__more" type="button" @click="emit('breakdown')">Full breakdown</button>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useLayoutStore } from '../stores/layout.js'
import RecipeLine from './RecipeLine.vue'

const emit = defineEmits(['breakdown'])
const analysis = useAnalysisStore()
const layout = useLayoutStore()
const entry = computed(() => analysis.inspectedColour)
// The recommended recipe, as in the colour list and next to the pointer.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
const share = computed(() => Math.round((entry.value?.share ?? 0) * 100) || '<1')

// Moved up and down only: the card is as wide as the window and has nowhere to go sideways.
const card = ref(null)
const dragging = ref(false)
let grip = 0
const style = computed(() => {
  const at = layout.positions.inspector
  return at ? { top: `${at.y}px`, bottom: 'auto' } : null
})

// The gap of the design, in pixels, however it is written in the stylesheet.
function margin() {
  const value = getComputedStyle(card.value).getPropertyValue('--gap').trim()
  const size = parseFloat(value) || 0
  return value.endsWith('rem') ? size * parseFloat(getComputedStyle(document.documentElement).fontSize) : size || 16
}

// A place that keeps the whole card in the window, a gap above and below.
function inWindow(y) {
  const gap = margin()
  const room = window.innerHeight - card.value.offsetHeight - gap
  return Math.round(Math.min(Math.max(gap, y), Math.max(gap, room)))
}

function startDrag(event) {
  if (event.button) return
  grip = event.clientY - card.value.getBoundingClientRect().top
  dragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.addEventListener('pointermove', drag)
  event.currentTarget.addEventListener('pointerup', endDrag)
  event.currentTarget.addEventListener('pointercancel', endDrag)
  event.preventDefault()
}

function drag(event) {
  layout.positions.inspector = { y: inWindow(event.clientY - grip) }
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
  const at = layout.positions.inspector
  if (at && card.value) layout.positions.inspector = { y: inWindow(at.y) }
}
watch(card, (el) => el && keepInWindow(), { flush: 'post' })
watch(recipe, () => card.value && keepInWindow(), { flush: 'post' })
onMounted(() => window.addEventListener('resize', keepInWindow))
onBeforeUnmount(() => window.removeEventListener('resize', keepInWindow))
</script>
