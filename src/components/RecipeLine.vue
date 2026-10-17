<template>
  <div class="recipe" :class="{ 'recipe--wide': wide, 'recipe--full': full, 'recipe--bare': !forms }">
    <div class="chip recipe__result" :style="chipStyle(recipe.hex)" :title="t('Mixed: {hex} · {dilution}', { hex: recipe.hex, dilution: t(recipe.dilution) })">
      <span class="chip__strong chip__text recipe__dilution">{{ t(recipe.dilution) }}</span>
      <span class="chip__text">{{ recipe.deltaE.toLocaleString(region, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }} • {{ t(matchQuality(recipe.deltaE)) }}</span>
    </div>
    <p v-if="full && recipe.paints.length" class="recipe__label">{{ t('Recipe') }}</p>
    <ul v-if="recipe.paints.length" class="recipe__paints" :aria-label="full ? t('Ratio: {ratio}', { ratio: ratioText }) : null">
      <li
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="chip chip--row recipe__paint"
        :style="[chipStyle(paints.byId[item.paintId].hex), full && { '--lines': lines[i] }]"
        :title="paintName(paints.byId[item.paintId])"
      >
        <span class="recipe__amount">
          <span class="chip__strong recipe__parts">{{ formatParts(recipe.parts[i]) }}</span>
          <template v-if="forms">{{ paintForms(paints.byId[item.paintId]) }}</template>
        </span>
        <span class="chip__text">
          <span class="chip__strong">{{ paintNumber(paints.byId[item.paintId].number) }}</span>
          {{ paintName(paints.byId[item.paintId]) }}
        </span>
      </li>
      <li v-for="n in emptySlots" :key="`empty-${n}`" class="chip chip--row chip--empty recipe__paint" aria-hidden="true"></li>
    </ul>
    <p v-else class="recipe__paper">{{ t('Leave the paper white') }}</p>
    <!-- The ratio as a bar: one segment per paint, as wide as its part of the mix. The full recipe
         shows the ratio in the height of its rows instead. -->
    <div v-if="!wide && !full && recipe.paints.length > 1" class="recipe__bar" role="img" :aria-label="t('Ratio: {ratio}', { ratio: ratioText })">
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
import { matchQuality } from '../lib/mixing.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const props = defineProps({
  recipe: { type: Object, required: true },
  // Wide layout for the printed sheet: one row of ingredients, no empty slots.
  wide: { type: Boolean, default: false },
  // For the recipe at the pointer: nothing cut short, one paint per row, each row as high as its part of the mix.
  full: { type: Boolean, default: false },
  // Pan or tube after the parts; left out next to the pointer, shown once the colour is clicked.
  forms: { type: Boolean, default: true },
})

const paints = usePaintsStore()
// The ingredient grid always shows complete rows of four slots.
const emptySlots = computed(() => (props.wide || props.full ? 0 : (4 - (props.recipe.paints.length % 4)) % 4))

// The height of each paint's row in lines: the smallest part is one line, the others in proportion to it.
const lines = computed(() => {
  const least = Math.min(...props.recipe.parts.slice(0, props.recipe.paints.length))
  return props.recipe.paints.map((_, i) => (least > 0 ? props.recipe.parts[i] / least : 1))
})

const ratioText = computed(() =>
  props.recipe.paints.map((item, i) => `${formatParts(props.recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)}`).join(', '),
)

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x`
}
</script>
