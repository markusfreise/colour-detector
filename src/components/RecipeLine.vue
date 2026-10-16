<template>
  <div class="recipe" :class="{ 'recipe--wide': wide, 'recipe--full': full }">
    <div class="chip recipe__result" :style="chipStyle(recipe.hex)" :title="t('Mixed: {hex} · {dilution}', { hex: recipe.hex, dilution: t(recipe.dilution) })">
      <span class="chip__strong chip__text recipe__dilution">{{ t(recipe.dilution) }}</span>
      <span class="chip__text">{{ recipe.deltaE.toLocaleString(region, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} • {{ t(matchQuality(recipe.deltaE)) }}</span>
    </div>
    <ul v-if="recipe.paints.length" class="recipe__paints">
      <li
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="chip chip--row recipe__paint"
        :style="chipStyle(paints.byId[item.paintId].hex)"
        :title="paintName(paints.byId[item.paintId])"
      >
        <span class="recipe__amount">
          <span class="chip__strong recipe__parts">{{ formatParts(recipe.parts[i]) }}</span>
          {{ paintForms(paints.byId[item.paintId]) }}
        </span>
        <span class="chip__text">
          <span class="chip__strong">{{ paintNumber(paints.byId[item.paintId].number) }}</span>
          {{ paintName(paints.byId[item.paintId]) }}
        </span>
      </li>
      <li v-for="n in emptySlots" :key="`empty-${n}`" class="chip chip--row chip--empty recipe__paint" aria-hidden="true"></li>
    </ul>
    <p v-else class="recipe__paper">{{ t('Leave the paper white') }}</p>
    <!-- The ratio as a bar: one segment per paint, as wide as its part of the mix. -->
    <div v-if="!wide && recipe.paints.length > (full ? 0 : 1)" class="recipe__bar" role="img" :aria-label="t('Ratio: {ratio}', { ratio: ratioText })">
      <span
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="recipe__part"
        :style="{ flexGrow: item.share, background: paints.byId[item.paintId].hex, color: contrastText(paints.byId[item.paintId].hex) }"
        :title="`${formatParts(recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)} ${paintName(paints.byId[item.paintId])}`"
      >
        <span class="recipe__part-text">{{ formatParts(recipe.parts[i]) }} {{ paintNumber(paints.byId[item.paintId].number) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { matchQuality } from '../lib/recipeText.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const props = defineProps({
  recipe: { type: Object, required: true },
  // Wide layout for the printed sheet: one row of ingredients, no empty slots.
  wide: { type: Boolean, default: false },
  // For the recipe at the pointer: nothing cut short, one paint per line, the ratio bar also for a single paint.
  full: { type: Boolean, default: false },
})

const paints = usePaintsStore()
// The ingredient grid always shows complete rows of four slots.
const emptySlots = computed(() => (props.wide || props.full ? 0 : (4 - (props.recipe.paints.length % 4)) % 4))

const ratioText = computed(() =>
  props.recipe.paints.map((item, i) => `${formatParts(props.recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)}`).join(', '),
)

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x`
}
</script>
