<template>
  <!-- The settings of the Blocking view: how many tones, where light ends and shadow begins, how large the masses are, how much of the photo shows through. -->
  <div class="blocking">
    <div class="field">
      <span class="field__label">{{ t('Tones') }}</span>
      <div class="segmented blocking__count">
        <button
          v-for="option in TONE_OPTIONS"
          :key="option.tones"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': settings.blockingTones === option.tones }"
          :aria-pressed="settings.blockingTones === option.tones"
          :title="t(option.title)"
          @click="setTones(option.tones)"
        >
          {{ option.tones }}
        </button>
      </div>
      <span class="field__hint">{{ t(settings.blockingTones === 2 ? 'Light against shadow (notan)' : 'Light, a middle tone and shadow') }}</span>
    </div>

    <!-- One slider per boundary between two tones: further left, more of the picture counts as light. -->
    <label v-for="(value, i) in split" :key="i" class="field">
      <span class="field__label">
        {{ split.length === 1 ? t('Light / shadow') : i === 0 ? t('Light / middle') : t('Middle / shadow') }}
        <output class="field__value">{{ Math.round(value) }}</output>
      </span>
      <input
        :value="value"
        class="field__range"
        type="range"
        min="5"
        max="95"
        :title="t('Further left, more of the picture counts as light')"
        @input="moveSplit(i, $event)"
        @change="commitSplit"
      />
    </label>
    <button v-if="settings.blockingSplit" class="blocking__reset" type="button" @click="resetSplit">{{ t('Split as the photo divides') }}</button>

    <label class="field">
      <span class="field__label">{{ t('Forms') }} <output class="field__value">{{ forms }}</output></span>
      <input :value="forms" class="field__range" type="range" min="0" max="10" :title="t('Left: more detail. Right: the largest masses.')" @input="forms = Number($event.target.value)" @change="commitForms" />
    </label>

    <div class="controls__settings controls__settings_two">
      <label class="field">
        <span class="field__label">{{ t('Over photo') }} <output class="field__value">{{ settings.blockingOpacity }}%</output></span>
        <input v-model.number="settings.blockingOpacity" class="field__range" type="range" min="20" max="100" step="5" :title="t('How strongly the tones cover the photo')" />
      </label>
      <label class="field">
        <span class="field__label">{{ t('Contrast') }} <output class="field__value">{{ settings.contrast }}%</output></span>
        <input v-model.number="settings.contrast" class="field__range" type="range" min="50" max="200" step="5" @change="analysis.analyse()" />
      </label>
    </div>

    <!-- The tones in painting order; one of them on its own with a tap, here or in the picture. -->
    <ul v-if="result" class="blocking__tones" :aria-label="t('Tones')">
      <li v-for="(share, tone) in result.shares" :key="tone">
        <button
          type="button"
          class="blocking__tone"
          :class="{ 'blocking__tone--active': analysis.blockingSolo === tone }"
          :aria-pressed="analysis.blockingSolo === tone"
          @click="analysis.blockingSolo = analysis.blockingSolo === tone ? null : tone"
        >
          <span class="blocking__swatch" :style="{ background: greyOf(tone) }"></span>
          <strong>{{ tone + 1 }}</strong>
          <span class="blocking__tone-name">{{ t(toneName(tone)) }}</span>
          <span class="blocking__share">{{ Math.round(share * 100) }}%</span>
        </button>
      </li>
    </ul>
    <p v-if="result && analysis.blockingSolo != null" class="blocking__advice">{{ t(advice(analysis.blockingSolo)) }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { toneGrey } from '../lib/blocking.js'
import { trackEvent } from '../lib/analytics.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const settings = analysis.settings
const result = computed(() => analysis.blockingResult)

const TONE_OPTIONS = [
  { tones: 2, title: 'Two tones: light against shadow (notan)' },
  { tones: 3, title: 'Three tones: light, a middle tone and shadow' },
]

function setTones(tones) {
  if (settings.blockingTones === tones) return
  settings.blockingTones = tones
  settings.blockingSplit = null
  trackEvent('blocking_tones_changed', { tones })
}

// The boundaries shown: set by hand, or where the photo divides, while they are dragged as dragged.
const dragged = ref(null)
const split = computed(() => dragged.value ?? settings.blockingSplit ?? result.value?.natural ?? (settings.blockingTones === 2 ? [50] : [35, 65]))
function moveSplit(i, event) {
  const next = [...split.value]
  next[i] = Number(event.target.value)
  // Two boundaries keep their order and a little room between them.
  if (next.length === 2) {
    if (i === 0) next[0] = Math.min(next[0], next[1] - 3)
    else next[1] = Math.max(next[1], next[0] + 3)
    event.target.value = next[i]
  }
  dragged.value = next
}
function commitSplit() {
  if (dragged.value) settings.blockingSplit = dragged.value
  dragged.value = null
}
function resetSplit() {
  settings.blockingSplit = null
}

// "Forms" moves the masses only when it is let go: each step is worked out anew.
const forms = ref(settings.blockingForms)
watch(
  () => settings.blockingForms,
  (value) => (forms.value = value),
)
function commitForms() {
  settings.blockingForms = forms.value
}

const greyOf = (tone) => `rgb(${toneGrey(tone, result.value?.tones ?? settings.blockingTones).join(',')})`
const toneName = (tone) => (tone === 0 ? 'Light' : tone === (result.value?.tones ?? 2) - 1 ? 'Shadow' : 'Middle tone')
// What the tone on its own tells the painter.
function advice(tone) {
  if (tone === 0) return 'The lightest tone: save the paper white here, or mask it before you paint.'
  if (tone === (result.value?.tones ?? 2) - 1) return 'The darkest tone: paint it last.'
  return 'The middle tone: one wash over everything but the light.'
}
</script>
