<template>
  <div v-if="rows.length" class="layerstrip" aria-label="Layers">
    <button
      v-for="row in rows"
      :key="row.index"
      class="layerstrip__layer"
      :class="{ 'layerstrip__layer--active': row.solo }"
      type="button"
      :style="{ background: row.hex, color: row.ink }"
      :aria-pressed="row.solo"
      :aria-label="`Show only layer ${row.number}, ${row.name}`"
      @click="analysis.soloLayer(row.index)"
    >
      {{ row.number }}
    </button>
    <button class="button button--ghost layerstrip__all" type="button" :disabled="analysis.layerSolo == null" @click="analysis.soloLayer(null)">All</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { contrastText } from '../lib/color.js'

// On a narrow screen the layers panel sits far below the picture; this row under the picture
// switches between the layers without scrolling.
const analysis = useAnalysisStore()
const paints = usePaintsStore()
const rows = computed(() =>
  (analysis.layerMode && analysis.layers ? analysis.layers.layers : [])
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.top > 0)
    .map(({ layer, index }) => ({
      index,
      number: analysis.layerNumbers[index],
      name: paints.byId[layer.paintId]?.name ?? layer.paintId,
      hex: layer.hexes[layer.top],
      ink: contrastText(layer.hexes[layer.top]),
      solo: analysis.layerSolo === index,
    })),
)
</script>
