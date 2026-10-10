<template>
  <div class="recipe" :class="{ 'recipe--compact': compact }">
    <span class="recipe__result swatch" :style="{ background: recipe.hex }" :title="`Mixed: ${recipe.hex}`"></span>
    <div class="recipe__body">
      <ul v-if="recipe.paints.length" class="recipe__paints">
        <li v-for="(item, i) in recipe.paints" :key="item.paintId" class="recipe__paint">
          <span class="recipe__parts">{{ formatParts(recipe.parts[i]) }}</span>
          <span class="swatch swatch--small" :style="{ background: paints.byId[item.paintId].hex }"></span>
          <span class="recipe__name">
            {{ paints.byId[item.paintId].name }}
            <small class="recipe__number">{{ paints.byId[item.paintId].number }}</small>
          </span>
        </li>
      </ul>
      <p v-else class="recipe__paper">Leave the paper white</p>
      <p class="recipe__meta">
        <span>{{ recipe.dilution }}</span>
        <span class="recipe__quality" :class="`recipe__quality--${matchQuality(recipe.deltaE)}`">
          ΔE {{ recipe.deltaE.toFixed(1) }} · {{ matchQuality(recipe.deltaE) }}
        </span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { usePaintsStore } from '../stores/paints.js'
import { matchQuality } from '../lib/mixing.js'

defineProps({
  recipe: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})

const paints = usePaintsStore()

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}×`
}
</script>
