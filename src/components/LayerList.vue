<template>
  <section class="panel layers">
    <header class="palette__header">
      <h2 class="panel__title">
        Layers
        <span v-if="result" class="palette__count">
          {{ result.layers.length }} {{ result.layers.length === 1 ? 'layer' : 'layers' }},
          {{ result.steps.length }} {{ result.steps.length === 1 ? 'coat' : 'coats' }}
        </span>
      </h2>
      <div class="palette__actions">
        <button v-if="result && !allShown" class="button button--ghost" type="button" @click="analysis.soloLayer(null)">All</button>
        <button class="button button--ghost" type="button" :disabled="!result" @click="print">Print / PDF</button>
        <button class="button button--ghost" type="button" @click="emit('show-paintbox')">Show paint box</button>
      </div>
    </header>

    <div v-if="!result && !analysis.busy" class="layers__empty">
      <p>No base paints chosen. Open the paint box and pick up to {{ MAX_LAYER_PAINTS }}, or let the app choose.</p>
      <div class="layers__empty-actions">
        <button class="button button--secondary" type="button" @click="emit('show-paintbox')">Show paint box</button>
        <button class="button button--ghost" type="button" @click="auto">Auto</button>
      </div>
    </div>

    <ol v-if="result" class="layers__list">
      <li
        v-for="row in rows"
        :key="row.paintId"
        class="layers__item"
        :class="{ 'layers__item--active': row.solo, 'layers__item--current': row.current }"
      >
        <label class="checkbox layers__tick" :title="`Show layer ${row.number} in the picture`">
          <input
            type="checkbox"
            :checked="row.shown"
            :aria-label="`Show layer ${row.number}, ${row.name}`"
            @change="onTick(row, $event)"
          />
          <span class="layers__number">{{ row.number }}</span>
        </label>
        <button class="layers__row" type="button" :aria-pressed="row.solo" :title="row.solo ? 'Show all layers' : 'Show only this layer'" @click="analysis.soloLayer(row.index)">
          <span class="swatch" :style="{ background: row.hex }" title="One coat on white paper"></span>
          <span class="palette__summary layers__summary">
            <span class="palette__paints">{{ row.name }}</span>
            <span class="palette__meta">{{ row.dilution }} · {{ row.coatsText }} · {{ percent(row.share) }}% of image</span>
          </span>
        </button>
        <!-- One segment per coat, in the colour that many coats give on white paper. -->
        <div class="palette__bar palette__bar--washes layers__coats">
          <button
            v-for="coat in row.coats"
            :key="coat.coats"
            class="palette__wash"
            :class="{ 'palette__wash--active': coat.step === analysis.layerStep }"
            type="button"
            :style="{ background: coat.hex, color: coat.ink }"
            :title="`Coat ${coat.coats}: ${percent(coat.share)}% of image. Click to see this step.`"
            :aria-label="`Coat ${coat.coats} of layer ${row.number}: show this step`"
            :aria-pressed="coat.step === analysis.layerStep"
            @click="analysis.goToStep(coat.step)"
          >
            {{ coat.coats }}
          </button>
        </div>
      </li>
    </ol>

    <template v-if="result">
      <p class="layers__note">Ticks only change what the picture shows. Change the paints in the paint box.</p>
      <p v-if="result.deltaE.rough > 0.1" class="layers__note layers__note--warn">
        {{ percent(result.deltaE.rough) }}% of the picture is out of reach of these paints. Compare with Photo, or try
        another paint or one more layer.
      </p>
      <p v-if="result.steps.length > 12" class="layers__note layers__note--warn">
        {{ result.steps.length }} coats is a long session. Fewer layers or coats shorten it.
      </p>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { contrastText } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'
import { isNative, sendNative } from '../lib/native.js'

const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()

const result = computed(() => analysis.layers)
const percent = (share) => Math.round(share * 100) || '<1'
const allShown = computed(() => analysis.layerStep == null && analysis.layerView.every(Boolean))

// One row per layer, in painting order: lightest first.
const rows = computed(() => {
  const view = analysis.layerView
  const step = analysis.layerStep == null ? null : result.value.steps[analysis.layerStep]
  return result.value.layers.map((layer, index) => {
    const paint = paints.byId[layer.paintId]
    const used = layer.coats.filter((c) => c.share > 0)
    return {
      index,
      number: index + 1,
      paintId: layer.paintId,
      name: paint ? `${paintNumber(paint.number)} ${paint.name}` : layer.paintId,
      hex: layer.hexes[1],
      dilution: layer.dilution.replace(/ \(.*\)$/, ''),
      coatsText: used.length ? `up to ${used.length} ${used.length === 1 ? 'coat' : 'coats'}` : 'not needed',
      share: layer.coats[0]?.share ?? 0,
      shown: !!view[index],
      solo: analysis.layerSolo === index,
      current: step?.layer === index,
      coats: used.map((c) => ({
        ...c,
        ink: contrastText(c.hex),
        step: result.value.steps.findIndex((s) => s.layer === index && s.coat === c.coats),
      })),
    }
  })
})

// Hand the choice of the base paints back to the app.
function auto() {
  paints.setLayerPaints(paints.activeBox.layerIds, true)
  analysis.analyse()
}

// The print stylesheet lays out the sheets; the browser's dialog offers "Save as PDF".
async function print() {
  if (isNative) return sendNative('print')
  // The sheets are built on `beforeprint`, but the page only renders them a tick later, which is
  // too late for a print started from this click. So they are built and rendered first.
  window.dispatchEvent(new Event('beforeprint'))
  await nextTick()
  window.print()
}

// The last shown layer cannot be unticked: put the tick back where the store refused.
function onTick(row, event) {
  analysis.showLayer(row.index, event.target.checked)
  event.target.checked = !!analysis.layerView[row.index]
}
</script>
