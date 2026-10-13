<template>
  <!-- The colour of the area tapped in the picture: which one it is, how much of the picture it
       covers, and the recipe to mix it. The whole breakdown opens from here. -->
  <aside v-if="entry" class="inspector" aria-label="The colour tapped in the picture">
    <div class="inspector__head">
      <span class="swatch inspector__swatch" :style="{ background: recipe?.hex ?? entry.targetHex }"></span>
      <h2 class="inspector__title">Colour {{ entry.label }}</h2>
      <span class="inspector__share">{{ share }}% of image</span>
      <button class="flyout__close inspector__close" type="button" title="Close" aria-label="Close the colour" @click="analysis.inspect(null)">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
    <RecipeLine v-if="recipe" :recipe="recipe" full />
    <p v-else class="inspector__paper">No paints selected in the paint box</p>
    <button class="button button--secondary inspector__more" type="button" @click="emit('breakdown')">Full breakdown</button>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import RecipeLine from './RecipeLine.vue'

const emit = defineEmits(['breakdown'])
const analysis = useAnalysisStore()
const entry = computed(() => analysis.inspectedColour)
// The recommended recipe, as in the colour list and next to the pointer.
const recipe = computed(() => entry.value?.recipes[entry.value.chosen] ?? null)
const share = computed(() => Math.round((entry.value?.share ?? 0) * 100) || '<1')
</script>
