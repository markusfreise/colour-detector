<template>
  <div class="recipe">
    <div class="chip recipe__result" :style="chipStyle(recipe.hex)" :title="`Mixed: ${recipe.hex} · ${recipe.dilution}`">
      <span class="chip__strong chip__text recipe__dilution">{{ recipe.dilution }}</span>
      <span class="chip__text">{{ recipe.deltaE.toFixed(1) }} • {{ matchQuality(recipe.deltaE) }}</span>
    </div>
    <ul v-if="recipe.paints.length" class="recipe__paints">
      <li
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="chip chip--row recipe__paint"
        :style="chipStyle(paints.byId[item.paintId].hex)"
        :title="paints.byId[item.paintId].name"
      >
        <span class="chip__strong recipe__parts">{{ formatParts(recipe.parts[i]) }}</span>
        <span class="chip__text">
          <span class="chip__strong">{{ paintNumber(paints.byId[item.paintId].number) }}</span>
          {{ paints.byId[item.paintId].name }}
        </span>
      </li>
      <li v-for="n in emptySlots" :key="`empty-${n}`" class="chip chip--row chip--empty recipe__paint" aria-hidden="true"></li>
    </ul>
    <p v-else class="recipe__paper">Leave the paper white</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { matchQuality } from '../lib/mixing.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'

const props = defineProps({
  recipe: { type: Object, required: true },
})

const paints = usePaintsStore()
// The ingredient grid always shows complete rows of four slots.
const emptySlots = computed(() => (4 - (props.recipe.paints.length % 4)) % 4)

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} x`
}
</script>
