<template>
  <div v-if="result" class="steps" :class="{ 'steps--active': step }">
    <button v-if="!step" class="button button--secondary" type="button" @click="analysis.goToStep(0)">{{ t('Paint step by step') }}</button>
    <template v-else>
      <div class="steps__bar">
        <button class="button button--ghost" type="button" :disabled="analysis.layerStep === 0" @click="analysis.goToStep(analysis.layerStep - 1)">
          {{ t('Previous') }}
        </button>
        <button class="button button--ghost" type="button" :disabled="last" @click="analysis.goToStep(analysis.layerStep + 1)">{{ t('Next') }}</button>
        <p class="steps__text">
          <strong>{{ t('Step {n} of {total}:', { n: analysis.layerStep + 1, total: result.steps.length }) }}</strong>
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
            :title="t(v.title)"
            @click="analysis.layerStepView = v.value"
          >
            {{ t(v.label) }}
          </button>
        </div>
        <button class="button button--ghost steps__close" type="button" @click="analysis.goToStep(null)">{{ t('Close') }}</button>
      </div>
      <div class="steps__body">
        <span class="chip steps__target" :style="chipStyle(step.hex)" :title="t('An estimate from one swatch: test the wash on a scrap first')">
          <span class="chip__text">{{ step.coat === 1 ? t('One stroke on white paper') : t('{n} coats on white paper', { n: step.coat }) }}</span>
        </span>
        <dl class="steps__lines">
          <div><dt>{{ t('Mix') }}</dt><dd>{{ mixText }}</dd></div>
          <div><dt>{{ t('Paint') }}</dt><dd>{{ paintText }}</dd></div>
          <div><dt>{{ t('Then') }}</dt><dd>{{ last ? t('you are done.') : t('let it dry completely.') }}</dd></div>
        </dl>
      </div>
      <p v-if="step.shapes > MANY_SHAPES" class="steps__warn">
        {{ t('{n} separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.', { n: step.shapes }) }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { chipStyle } from '../lib/color.js'
import { useText, washGuideText } from '../i18n/index.js'

const { t, paintName } = useText()
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
const name = computed(() => (paints.byId[step.value.paintId] ? paintName(paints.byId[step.value.paintId]) : step.value.paintId))
const percent = (share) => Math.round(share * 100) || '<1'
const title = computed(() => {
  const number = analysis.layerNumbers[step.value.layer]
  const coats = layer.value.top > 1 ? t(', coat {n} of {total}', { n: step.value.coat, total: layer.value.top }) : ''
  const same = result.value.layers.filter((l) => l.top > 0 && (l.kind === 'accent') === accent.value).length
  return t(accent.value ? 'Accent {n} of {total}, {name}{coats}' : 'Layer {n} of {total}, {name}{coats}', {
    n: String(number).replace('A', ''),
    total: same,
    name: name.value,
    coats,
  })
})
// The first coat of a layer says how to prepare its wash; later coats use the same one.
const mixText = computed(() => {
  if (step.value.coat > 1) return t('the same wash again.')
  return `${layer.value.guide ? washGuideText(t, layer.value) : t(step.value.dilution).replace(/ \(.*\)$/, '')}.`
})
const paintText = computed(() =>
  accent.value
    ? `${t(`{n} small ${step.value.shapes === 1 ? 'shape' : 'shapes'}${analysis.layerStepView === 'paint' ? ' in full colour' : ''}`, { n: step.value.shapes })}.`
    : t('{areas}, {percent}% of the picture.', { areas: t(AREAS[analysis.layerStepView]), percent: percent(step.value.share) }),
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
