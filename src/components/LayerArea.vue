<template>
  <section v-if="spot" class="panel editor">
    <header class="editor__header">
      <h2 class="panel__title">This spot</h2>
      <button class="button button--ghost" type="button" @click="analysis.selectPoint(null)">Close</button>
    </header>
    <div class="editor__compare">
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(spot.photo)">
          <span class="chip__text">{{ spot.photo }}</span>
        </span>
        <span class="editor__caption">Photo</span>
      </div>
      <div class="editor__swatch">
        <span class="chip editor__chip" :style="chipStyle(spot.layered)">
          <span class="chip__text">{{ spot.deltaE.toFixed(1) }} • {{ matchQuality(spot.deltaE) }}</span>
        </span>
        <span class="editor__caption">Layered</span>
      </div>
    </div>
    <h3 class="editor__subtitle">Layers on this spot</h3>
    <p v-if="!painted" class="editor__empty">Leave the paper white.</p>
    <ol class="layers__spot">
      <li v-for="row in rows" :key="row.number" class="layers__spot-row" :class="{ 'layers__spot-row--none': !row.coats }">
        <span class="layers__number">{{ row.number }}</span>
        <span class="swatch swatch--small" :style="{ background: row.hex }"></span>
        <span class="layers__spot-name">{{ row.name }}</span>
        <span class="layers__spot-coats">{{ row.coats ? `${row.coats} ${row.coats === 1 ? 'coat' : 'coats'}` : 'none' }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { chipStyle } from '../lib/color.js'
import { matchQuality } from '../lib/mixing.js'

const analysis = useAnalysisStore()
const paints = usePaintsStore()

const spot = computed(() => (analysis.layerMode ? analysis.layerSpot : null))
const painted = computed(() => spot.value.coats.some(Boolean))
// Every layer in painting order with the coats this spot gets.
const rows = computed(() =>
  analysis.layers.layers.map((layer, k) => ({
    number: k + 1,
    name: paints.byId[layer.paintId]?.name ?? layer.paintId,
    coats: spot.value.coats[k],
    hex: layer.hexes[spot.value.coats[k] || 1],
  })),
)
</script>
