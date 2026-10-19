<template>
  <div class="recipe" :class="{ 'recipe--wide': wide, 'recipe--full': full, 'recipe--bare': !forms }">
    <!-- At the pointer: the mix without water as a square, the washed colour with its letter beside it, the wash in words below. -->
    <template v-if="full">
      <div class="recipe__wash" :title="t('Mixed: {hex} · {dilution}', { hex: recipe.hex, dilution: t(recipe.dilution) })">
        <span class="recipe__swatch" :style="chipStyle(baseHex)" :title="baseHex"></span>
        <span class="chip recipe__result" :style="chipStyle(recipe.hex)">
          <span class="chip__strong recipe__letter">{{ washText }}</span>
        </span>
      </div>
      <p v-if="letter || washLetter(recipe.fullness)" class="recipe__explain">{{ t(recipe.dilution) }}</p>
    </template>
    <div v-else class="chip recipe__result" :style="chipStyle(recipe.hex)" :title="t('Mixed: {hex} · {dilution}', { hex: recipe.hex, dilution: t(recipe.dilution) })">
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
         has the parts in its rows, so its bar is colour only. -->
    <div v-if="!wide && recipe.paints.length > 1" class="recipe__bar" role="img" :aria-label="t('Ratio: {ratio}', { ratio: ratioText })">
      <span
        v-for="(item, i) in recipe.paints"
        :key="item.paintId"
        class="recipe__part"
        :style="{ flexGrow: item.share, background: paints.byId[item.paintId].hex, color: contrastText(paints.byId[item.paintId].hex) }"
        :title="`${formatParts(recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)} ${paintName(paints.byId[item.paintId])}`"
      >
        <span v-if="!full" class="recipe__part-text">{{ formatParts(recipe.parts[i]) }} {{ paintNumber(paints.byId[item.paintId].number) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { matchQuality, washLetter } from '../lib/recipeText.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const props = defineProps({
  recipe: { type: Object, required: true },
  // Wide layout for the printed sheet: one row of ingredients, no empty slots.
  wide: { type: Boolean, default: false },
  // For the recipe at the pointer: the wash as a letter, nothing cut short, one paint per row.
  full: { type: Boolean, default: false },
  // Pan or tube after the parts; left out next to the pointer, shown once the colour is clicked.
  forms: { type: Boolean, default: true },
  // The wash letter of the colour as its label on the picture shows it; by default the recipe's own.
  letter: { type: String, default: '' },
})

const paints = usePaintsStore()
// The ingredient grid always shows complete rows of four slots.
const emptySlots = computed(() => (props.wide || props.full ? 0 : (4 - (props.recipe.paints.length % 4)) % 4))

// The letter, or the wash in words where there is none (paper only).
const washText = computed(() => props.letter || washLetter(props.recipe.fullness) || t(props.recipe.dilution))

// The mix without water: the same ratio, its largest part at full strength (from the mixing service).
const baseHex = computed(() => props.recipe.baseHex ?? props.recipe.hex)

const ratioText = computed(() =>
  props.recipe.paints.map((item, i) => `${formatParts(props.recipe.parts[i])} ${paintNumber(paints.byId[item.paintId].number)}`).join(', '),
)

function formatParts(n) {
  return `${Number.isInteger(n) ? n : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x`
}
</script>
