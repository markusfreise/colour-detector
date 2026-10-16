<template>
  <section v-if="spot" class="panel editor">
    <header class="editor__header">
      <h2 class="panel__title">{{ t('This spot') }}</h2>
      <button class="button button--ghost" type="button" @click="analysis.selectPoint(null)">{{ t('Close') }}</button>
    </header>
    <div class="editor__compare">
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(spot.photo)">
          <span class="chip__text">{{ spot.photo }}</span>
        </span>
        <span class="editor__caption">{{ t('Photo') }}</span>
      </div>
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(spot.layered)">
          <span class="chip__text" :title="t('Distance to the photo: {value}', { value: spot.deltaE.toLocaleString(region, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })">{{ t('Match: {quality}', { quality: t(matchQuality(spot.deltaE)) }) }}</span>
        </span>
        <span class="editor__caption">{{ t('Layered') }}</span>
      </div>
    </div>
    <h3 class="editor__subtitle">{{ t('Layers on this spot') }}</h3>
    <p v-if="!painted" class="editor__empty">{{ t('Leave the paper white.') }}</p>
    <ol class="layers__spot">
      <li v-for="row in rows.filter((r) => r.coats)" :key="row.number">
        <button
          class="layers__spot-row"
          :class="{ 'layers__spot-row--none': !row.coats }"
          type="button"
          :disabled="row.step < 0"
          :title="row.step < 0 ? t('This layer leaves the spot unpainted') : t('Show the step that paints this')"
          @click="analysis.goToStep(row.step)"
        >
          <span class="layers__number">{{ row.number }}</span>
          <span class="swatch swatch--small" :style="{ background: row.hex }"></span>
          <span class="layers__spot-name">{{ row.name }}</span>
          <span class="layers__spot-coats">{{ row.coats ? t(row.coats === 1 ? '{n} coat' : '{n} coats', { n: row.coats }) : t('none') }}</span>
        </button>
      </li>
    </ol>
    <p v-if="painted && skipped.length" class="layers__note">{{ t('Not painted here: {layers}.', { layers: skipped.join(', ') }) }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { chipStyle } from '../lib/color.js'
import { matchQuality } from '../lib/recipeText.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const analysis = useAnalysisStore()
const paints = usePaintsStore()

const spot = computed(() => (analysis.layerMode ? analysis.layerSpot : null))
const painted = computed(() => spot.value.coats.some(Boolean))
// Every layer in painting order with the coats this spot gets.
const rows = computed(() =>
  analysis.layers.layers.map((layer, k) => ({
    number: analysis.layerNumbers[k],
    used: layer.top > 0,
    name: ((name) => (layer.kind === 'accent' ? t('{name} (accent)', { name }) : name))(paints.byId[layer.paintId] ? paintName(paints.byId[layer.paintId]) : layer.paintId),
    coats: spot.value.coats[k],
    hex: layer.hexes[spot.value.coats[k] || 1],
    // The last step that touches this spot in this layer.
    step: spot.value.coats[k] ? analysis.layers.steps.findIndex((s) => s.layer === k && s.coat === spot.value.coats[k]) : -1,
  })),
)
// Numbers of the layers that leave this spot alone.
const skipped = computed(() => rows.value.filter((r) => r.used && !r.coats).map((r) => r.number))
</script>
