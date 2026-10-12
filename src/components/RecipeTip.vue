<template>
  <div v-if="entry" class="tip" :style="style" role="tooltip">
    <div class="tip__header">
      <span class="swatch swatch--small" :style="{ background: recipe?.hex ?? entry.targetHex }"></span>
      <strong>Colour {{ entry.label }}</strong>
      <span class="tip__share">{{ Math.round(entry.share * 100) || '<1' }}% of image</span>
    </div>
    <!-- The recommended recipe as in the recipe panel: wash and match, the paints with their parts, the ratio as a bar. -->
    <RecipeLine v-if="recipe" :recipe="recipe" full />
    <p v-else class="tip__paper">No paints selected in the paint box</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import RecipeLine from './RecipeLine.vue'

const props = defineProps({
  // The palette entry under the pointer, or null.
  index: { type: Number, default: null },
  // The pointer in the window.
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
})

const OFFSET = 18 // clear of the pointer

const analysis = useAnalysisStore()
const entry = computed(() => (props.index == null ? null : analysis.entries[props.index] ?? null))
// The recommended recipe: the one chosen for this colour in the list.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
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
