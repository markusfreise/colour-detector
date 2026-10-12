<template>
  <div v-if="entry" class="tip" :style="style" role="tooltip">
    <div class="tip__header">
      <span class="swatch tip__swatch" :style="{ background: hex }"></span>
      <span class="tip__title">
        <strong>Colour {{ entry.label }}</strong>
        <span v-if="recipe?.paints.length" class="tip__dilution">{{ dilution }}</span>
      </span>
    </div>
    <ul v-if="recipe?.paints.length" class="tip__paints">
      <li v-for="paint in used" :key="paint.id" class="tip__paint">
        <span class="tip__parts">{{ paint.parts }} x</span>
        <span class="swatch swatch--small" :style="{ background: paint.hex }"></span>
        <span><strong>{{ paint.number }}</strong> {{ paint.name }}</span>
      </li>
    </ul>
    <p v-else class="tip__paper">{{ recipe ? 'Leave the paper white' : 'No paints selected in the paint box' }}</p>
    <div v-if="used.length > 1" class="tip__bar">
      <span v-for="paint in used" :key="paint.id" class="tip__part" :style="{ flexGrow: paint.share, background: paint.hex }"></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { paintNumber } from '../lib/paintbox.js'

const props = defineProps({
  // The palette entry under the pointer, or null.
  index: { type: Number, default: null },
  // The pointer in the window.
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})

const OFFSET = 18 // clear of the pointer

const analysis = useAnalysisStore()
const paints = usePaintsStore()
const entry = computed(() => (props.index == null ? null : analysis.entries[props.index] ?? null))
// The recommended recipe: the one chosen for this colour in the list.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
const hex = computed(() => recipe.value?.hex ?? entry.value.targetHex)
const dilution = computed(() => recipe.value.dilution.replace(/ \(.*\)$/, ''))
const used = computed(() =>
  (recipe.value?.paints ?? []).map((item, i) => {
    const paint = paints.byId[item.paintId]
    const parts = recipe.value.parts[i]
    return { id: item.paintId, share: item.share, hex: paint.hex, name: paint.name, number: paintNumber(paint.number), parts: Number.isInteger(parts) ? String(parts) : parts.toFixed(1) }
  }),
)
// Below and right of the pointer, or on the other side of it near the edge of the window.
const style = computed(() => {
  const left = props.x > window.innerWidth * 0.6, up = props.y > window.innerHeight * 0.6
  return {
    left: `${props.x + (left ? -OFFSET : OFFSET)}px`,
    top: `${props.y + (up ? -OFFSET : OFFSET)}px`,
    transform: `translate(${left ? '-100%' : '0'}, ${up ? '-100%' : '0'})`,
  }
})
</script>
