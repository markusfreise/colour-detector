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
          Layer {{ step.layer + 1 }} of {{ result.layers.length }}, {{ name }}, coat {{ step.coat }}
        </p>
        <button class="button button--ghost" type="button" :disabled="last" @click="analysis.goToStep(analysis.layerStep + 1)">Next</button>
        <button class="button button--ghost" type="button" @click="analysis.goToStep(null)">Done</button>
      </div>
      <p class="steps__hint">
        {{ washText }} Paint the outlined areas ({{ percent(step.share) }}% of the picture).
        {{ last ? 'Last step.' : 'Let it dry completely before the next step.' }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'

const analysis = useAnalysisStore()
const paints = usePaintsStore()

const result = computed(() => (analysis.layerMode ? analysis.layers : null))
const step = computed(() => (result.value && analysis.layerStep != null ? result.value.steps[analysis.layerStep] : null))
const last = computed(() => analysis.layerStep === result.value.steps.length - 1)
const name = computed(() => paints.byId[step.value.paintId]?.name ?? step.value.paintId)
const percent = (share) => Math.round(share * 100) || '<1'
// The first coat of a layer says how to prepare its wash; later coats use the same one.
const washText = computed(() => {
  const dilution = step.value.dilution.replace(/ \(.*\)$/, '')
  return step.value.coat === 1 ? `Prepare ${name.value} as a ${dilution.replace(/ wash$/, '')} wash.` : 'The same wash again.'
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
