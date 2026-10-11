<template>
  <div v-if="result" class="steps" :class="{ 'steps--active': step }">
    <button v-if="!step" class="button button--secondary" type="button" @click="analysis.goToStep(0)">Paint step by step</button>
    <template v-else>
      <div class="steps__bar">
        <button class="button button--ghost" type="button" :disabled="analysis.layerStep === 0" @click="analysis.goToStep(analysis.layerStep - 1)">
          Previous
        </button>
        <p class="steps__text">
          <strong>Step {{ analysis.layerStep + 1 }} of {{ result.steps.length }}</strong>
          <span class="swatch swatch--small steps__swatch" :style="{ background: step.hex }"></span>
          {{ accent ? 'Accent' : `Layer ${step.layer + 1}` }}, {{ name }}{{ accent ? '' : `, coat ${step.coat}` }}
        </p>
        <button class="button button--ghost" type="button" :disabled="last" @click="analysis.goToStep(analysis.layerStep + 1)">Next</button>
        <button class="button button--ghost" type="button" @click="analysis.goToStep(null)">Done</button>
      </div>
      <div class="steps__body">
        <span class="chip steps__target" :style="chipStyle(step.hex)" title="One stroke of this wash on white paper">
          <span class="chip__text">{{ step.coat === 1 ? 'One stroke on white paper' : `${step.coat} coats on white paper` }}</span>
        </span>
        <p class="steps__hint">
          {{ washText }} Paint the areas in full colour ({{ percent(step.share) }}% of the picture).
          {{ last ? 'Last step.' : 'Let it dry completely before the next step.' }}
          <span v-if="accent" class="steps__note">{{ step.shapes }} small shapes: the darkest or brightest touches, set last.</span>
          <span v-else-if="step.shapes > MANY_SHAPES" class="steps__warn">
            {{ step.shapes }} separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.
          </span>
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { chipStyle } from '../lib/color.js'

// More separate shapes than this in one step is tedious to paint.
const MANY_SHAPES = 30

const analysis = useAnalysisStore()
const paints = usePaintsStore()

// Without a single coat (a white picture) there is nothing to walk through.
const result = computed(() => (analysis.layerMode && analysis.layers?.steps.length ? analysis.layers : null))
const step = computed(() => (result.value && analysis.layerStep != null ? result.value.steps[analysis.layerStep] : null))
const layer = computed(() => result.value.layers[step.value.layer])
const accent = computed(() => step.value.kind === 'accent')
const last = computed(() => analysis.layerStep === result.value.steps.length - 1)
const name = computed(() => paints.byId[step.value.paintId]?.name ?? step.value.paintId)
const percent = (share) => Math.round(share * 100) || '<1'
// The first coat of a layer says how to prepare its wash; later coats use the same one.
const washText = computed(() => {
  if (step.value.coat > 1) return 'The same wash again, over the dry coat.'
  // The guide (paint to water) says more than a word like "watery"; without one, fall back to the word.
  const how = layer.value.guide ?? `a ${step.value.dilution.replace(/ \(.*\)$/, '')}`
  return `Prepare ${name.value}${accent.value ? ' as a strong wash' : ''}: ${how}. One stroke on white paper should look like the swatch.`
})

// Left and right arrow keys step while the walk is active.
function onKey(event) {
  if (!step.value || event.target.closest?.('input, select, textarea, dialog')) return
  if (event.key === 'ArrowRight') analysis.goToStep(analysis.layerStep + 1)
  else if (event.key === 'ArrowLeft') analysis.goToStep(analysis.layerStep - 1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
