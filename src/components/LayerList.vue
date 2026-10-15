<template>
  <section class="panel layers">
    <header class="layers__header">
      <h2 class="panel__title">
        {{ t('Layers') }}
        <span v-if="result" class="palette__count">{{ countText }}</span>
      </h2>
      <div class="palette__actions">
        <button class="button button--ghost" type="button" :disabled="!result || allShown" @click="analysis.soloLayer(null)">{{ t('All') }}</button>
        <button class="button button--ghost" type="button" @click="emit('show-paintbox')">{{ t('Show paint box') }}</button>
      </div>
    </header>

    <div v-if="!result && !analysis.busy" class="layers__empty">
      <p>{{ t('No base paints chosen. Open the paint box and pick up to {n}, or let the app choose.', { n: MAX_LAYER_PAINTS }) }}</p>
      <div class="layers__empty-actions">
        <button class="button button--secondary" type="button" @click="emit('show-paintbox')">{{ t('Show paint box') }}</button>
        <button class="button button--ghost" type="button" @click="auto">{{ t('Auto') }}</button>
      </div>
    </div>

    <template v-for="group in groups" :key="group.title">
      <h3 v-if="group.title" class="editor__subtitle">{{ group.title }}</h3>
      <ol class="layers__list">
        <li
          v-for="row in group.rows"
          :key="row.index"
          class="layers__item"
          :class="{ 'layers__item--active': row.solo, 'layers__item--current': row.current }"
        >
          <label class="checkbox layers__tick" :title="t('Show layer {n} in the picture', { n: row.number })">
            <input type="checkbox" :checked="row.shown" :aria-label="t('Show only layer {n}, {name}', { n: row.number, name: row.name })" @change="onTick(row, $event)" />
            <span class="layers__number">{{ row.number }}</span>
          </label>
          <button class="layers__row" type="button" :aria-pressed="row.solo" :title="row.title" @click="analysis.soloLayer(row.index)">
            <span class="swatch" :style="{ background: row.hex }" :title="t('One stroke on white paper. An estimate from one swatch: test the wash on a scrap first.')"></span>
            <span class="palette__summary layers__summary">
              <span class="layers__name">{{ row.name }}</span>
              <span class="palette__meta">{{ row.meta }}</span>
            </span>
          </button>
          <!-- With two or more coats: one segment per coat, in the colour that many coats give on white paper,
               as wide as the part of the layer's area that ends with that many coats. -->
          <div v-if="row.coats.length > 1" class="palette__bar palette__bar--washes layers__coats">
            <button
              v-for="coat in row.coats"
              :key="coat.coats"
              class="palette__wash"
              :class="{ 'palette__wash--active': coat.step === analysis.layerStep }"
              type="button"
              :style="{ background: coat.hex, color: coat.ink, flexGrow: Math.max(coat.only, 0.001) }"
              :title="t('{coats} on {percent}% of the image. Click to see the step that paints coat {n}.', { coats: plural(coat.coats, 'coat'), percent: percent(coat.only), n: coat.coats })"
              :aria-label="t('Coat {n} of layer {layer}: show this step', { n: coat.coats, layer: row.number })"
              :aria-pressed="coat.step === analysis.layerStep"
              @click="analysis.goToStep(coat.step)"
            >
              {{ plural(coat.coats, 'coat') }}
            </button>
          </div>
        </li>
      </ol>
    </template>

    <template v-if="result">
      <p v-if="unused.length" class="layers__note">{{ unusedText }}</p>
      <p v-if="result.deltaE.rough >= 0.1" class="layers__note layers__note--warn">
        {{ t('{percent}% of the picture is out of reach of these paints. Compare with Photo, or swap a paint.', { percent: percent(result.deltaE.rough) }) }}
      </p>
      <p class="layers__note">{{ t('Ticks only change what the picture shows. Change the paints in the paint box.') }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { contrastText } from '../lib/color.js'
import { matchQuality } from '../lib/mixing.js'
import { paintNumber } from '../lib/paintbox.js'
import { useText, washGuideText } from '../i18n/index.js'

const { t, paintName: nameOf, region } = useText()
const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()

const result = computed(() => analysis.layers)
const percent = (share) => Math.round(share * 100) || '<1'
const allShown = computed(() => analysis.layerStep == null && analysis.layerView.every(Boolean))
const paintLabel = (id) => {
  const paint = paints.byId[id]
  return paint ? `${paintNumber(paint.number)} ${nameOf(paint)}` : id
}
// What an accent is there for.
const ROLES = { colour: 'for a colour the washes miss', dark: 'for the darks' }
const plural = (n, word) => t(n === 1 ? `{n} ${word}` : `{n} ${word}s`, { n })

// One row per painted layer, in painting order: the washes light to dark, then the accents.
const rows = computed(() => {
  if (!result.value) return []
  const view = analysis.layerView
  const step = analysis.layerStep == null ? null : result.value.steps[analysis.layerStep]
  return result.value.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.top > 0)
    .map(({ layer, index }) => {
      const coats = layer.coats.filter((c) => c.share > 0)
      const accent = layer.kind === 'accent'
      const share = layer.coats[0]?.share ?? 0
      // What the picture gains from this layer: the mean distance to the photo without it and with it.
      const gain = layer.buys ? layer.buys.without - layer.buys.with : 0
      const solo = analysis.layerSolo === index
      const wash = layer.water >= 1 ? t('1:{n} with water, like {consistency}', { n: layer.water.toLocaleString(region.value), consistency: t(layer.consistency) }) : layer.guide ? washGuideText(t, layer) : ''
      return {
        index,
        number: analysis.layerNumbers[index],
        accent,
        name: paintLabel(layer.paintId),
        hex: layer.hexes[1],
        meta: [wash, accent || coats.length < 2 ? null : plural(coats.length, 'coat'), `${percent(share)}%`, accent && ROLES[layer.role] ? t(ROLES[layer.role]) : null]
          .filter(Boolean)
          .join(' · '),
        title: `${solo ? t('Show all layers.') : t('Show only this layer.')}${gain >= 0.05 ? t(' It brings the picture {value} closer to the photo.', { value: gain.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : ''}`,
        shown: !!view[index],
        solo,
        current: step?.layer === index,
        coats: coats.map((c) => ({
          ...c,
          ink: contrastText(c.hex),
          step: result.value.steps.findIndex((s) => s.layer === index && s.coat === c.coats),
        })),
      }
    })
})
const groups = computed(() => {
  const washes = rows.value.filter((r) => !r.accent)
  const accents = rows.value.filter((r) => r.accent)
  return [
    ...(washes.length ? [{ title: '', rows: washes }] : []),
    ...(accents.length ? [{ title: t('Accents, painted last'), rows: accents }] : []),
  ]
})
const countText = computed(() => {
  const washes = rows.value.filter((r) => !r.accent).length
  const accents = rows.value.length - washes
  const parts = [plural(washes, 'layer'), accents ? plural(accents, 'accent') : null, plural(result.value.steps.length, 'step')]
  return t('{parts} · match: {quality}', { parts: parts.filter(Boolean).join(', '), quality: t(matchQuality(result.value.deltaE.mean)) })
})

// Paints that got no layer because they would add too little to this picture.
const unused = computed(() => result.value.layers.filter((l) => !(l.top > 0)).map((l) => paintLabel(l.paintId)))
const unusedText = computed(() =>
  paints.palette.layerAuto
    ? t('Not needed for this picture: {paints}.', { paints: unused.value.join(', ') })
    : t(
        unused.value.length === 1
          ? 'No layer for {paints}: it adds too little here. Swap it in the paint box.'
          : 'No layer for {paints}: they add too little here. Swap them in the paint box.',
        { paints: unused.value.join(', ') },
      ),
)

// The store refuses to untick the last layer shown; put the tick back so the box does not lie.
function onTick(row, event) {
  analysis.showLayer(row.index, event.target.checked)
  event.target.checked = !!analysis.layerView[row.index]
}

// Hand the choice of the base paints back to the app.
function auto() {
  analysis.proposeLayers()
}
</script>
