<template>
  <div v-if="result" class="steps" :class="{ 'steps--active': step }">
    <button v-if="!step" class="button button--secondary" type="button" @click="analysis.goToStep(0)">Paint step by step</button>
    <template v-else>
      <div class="steps__bar">
        <button class="button button--ghost" type="button" :disabled="analysis.layerStep === 0" @click="analysis.goToStep(analysis.layerStep - 1)">
          Previous
        </button>
        <button class="button button--ghost" type="button" :disabled="last" @click="analysis.goToStep(analysis.layerStep + 1)">Next</button>
        <p class="steps__text">
          <strong>Step {{ analysis.layerStep + 1 }} of {{ result.steps.length }}:</strong>
          {{ title }}
        </p>
        <div class="segmented steps__view">
          <button
            v-for="v in views"
            :key="v.value"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': analysis.layerStepView === v.value }"
            :aria-pressed="analysis.layerStepView === v.value"
            :title="v.title"
            @click="analysis.layerStepView = v.value"
          >
            {{ v.label }}
          </button>
        </div>
        <button class="button button--ghost steps__close" type="button" @click="analysis.goToStep(null)">Close</button>
      </div>
      <div class="steps__body">
        <span class="chip steps__target" :style="chipStyle(step.hex)" title="An estimate from one swatch: test the wash on a scrap first">
          <span class="chip__text">{{ step.coat === 1 ? 'One stroke on white paper' : `${step.coat} coats on white paper` }}</span>
        </span>
        <dl class="steps__lines">
          <div><dt>Mix</dt><dd>{{ mixText }}</dd></div>
          <div><dt>Paint</dt><dd>{{ paintText }}</dd></div>
          <div><dt>Then</dt><dd>{{ last ? 'you are done.' : 'let it dry completely.' }}</dd></div>
        </dl>
      </div>
      <p v-if="step.shapes > MANY_SHAPES" class="steps__warn">
        {{ step.shapes }} separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.
      </p>
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

const views = [
  { value: 'paint', label: 'Where to paint', title: 'The paper after this step; what is painted now in full colour, the rest faded' },
  { value: 'wash', label: 'This wash', title: 'Only the areas painted now, filled with one stroke of this wash' },
  { value: 'result', label: 'So far', title: 'The paper with all layers up to and including this step' },
]
const AREAS = { paint: 'the areas in full colour', wash: 'the filled areas', result: 'the areas of this step' }

const analysis = useAnalysisStore()
const paints = usePaintsStore()

// Without a single coat (a white picture) there is nothing to walk through.
const result = computed(() => (analysis.layerMode ? analysis.layers : null))
const step = computed(() => (result.value && analysis.layerStep != null ? result.value.steps[analysis.layerStep] : null))
const layer = computed(() => result.value.layers[step.value.layer])
const accent = computed(() => step.value.kind === 'accent')
const last = computed(() => analysis.layerStep === result.value.steps.length - 1)
const name = computed(() => paints.byId[step.value.paintId]?.name ?? step.value.paintId)
const percent = (share) => Math.round(share * 100) || '<1'
const title = computed(() => {
  const number = analysis.layerNumbers[step.value.layer]
  const coats = layer.value.top > 1 ? `, coat ${step.value.coat} of ${layer.value.top}` : ''
  const same = result.value.layers.filter((l) => l.top > 0 && (l.kind === 'accent') === accent.value).length
  return `${accent.value ? 'Accent' : 'Layer'} ${String(number).replace('A', '')} of ${same}, ${name.value}${coats}`
})
// The first coat of a layer says how to prepare its wash; later coats use the same one.
const mixText = computed(() => {
  if (step.value.coat > 1) return 'the same wash again.'
  return `${layer.value.guide ?? step.value.dilution.replace(/ \(.*\)$/, '')}.`
})
const paintText = computed(() =>
  accent.value
    ? `${step.value.shapes} small ${step.value.shapes === 1 ? 'shape' : 'shapes'}${analysis.layerStepView === 'paint' ? ' in full colour' : ''}.`
    : `${AREAS[analysis.layerStepView]}, ${percent(step.value.share)}% of the picture.`,
)

// Left and right arrow keys step while the walk is active.
function onKey(event) {
  if (!step.value || event.target.closest?.('input, select, textarea, dialog')) return
  if (event.key === 'ArrowRight') analysis.goToStep(analysis.layerStep + 1)
  else if (event.key === 'ArrowLeft') analysis.goToStep(analysis.layerStep - 1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
