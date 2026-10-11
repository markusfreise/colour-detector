<template>
  <div class="recipe" :class="{ 'recipe--wide': wide }">
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
        <span class="recipe__amount">
          <span class="chip__strong recipe__parts">{{ formatParts(recipe.parts[i]) }}</span>
          {{ paintForms(paints.byId[item.paintId]) }}
        </span>
        <span class="chip__text">
          <span class="chip__strong">{{ paintNumber(paints.byId[item.paintId].number) }}</span>
          {{ paints.byId[item.paintId].name }}
        </span>
      </li>
      <li v-for="n in emptySlots" :key="`empty-${n}`" class="chip chip--row chip--empty recipe__paint" aria-hidden="true"></li>
    </ul>
    <p v-else class="recipe__paper">Leave the paper white</p>
    <!-- The ratio as a bar: one segment per paint, as wide as its part of the mix. -->
    <div v-if="!wide && recipe.paints.length > 1" class="recipe__bar" role="img" :aria-label="`Ratio: ${ratioText}`">
      <span
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="recipe__part"
        :style="{ flexGrow: item.share, background: paints.byId[item.paintId].hex, color: contrastText(paints.byId[item.paintId].hex) }"
        :title="`${formatParts(recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)} ${paints.byId[item.paintId].name}`"
      >
        <span class="recipe__part-text">{{ formatParts(recipe.parts[i]) }} {{ paintNumber(paints.byId[item.paintId].number) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { matchQuality } from '../lib/mixing.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'

const props = defineProps({
  recipe: { type: Object, required: true },
  // Wide layout for the printed sheet: one row of ingredients, no empty slots.
  wide: { type: Boolean, default: false },
})

const paints = usePaintsStore()
// The ingredient grid always shows complete rows of four slots.
const emptySlots = computed(() => (props.wide ? 0 : (4 - (props.recipe.paints.length % 4)) % 4))

const ratioText = computed(() =>
  props.recipe.paints.map((item, i) => `${formatParts(props.recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)}`).join(', '),
)

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} x`
}
</script>
