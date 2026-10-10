<template>
  <section class="panel palette">
    <header class="palette__header">
      <h2 class="panel__title">Colours</h2>
      <button class="button button--ghost" type="button" @click="emit('show-paintbox')">Show paint box</button>
    </header>
    <ol class="palette__list">
      <li
        v-for="(entry, i) in analysis.entries"
        :key="entry.id"
        class="palette__item"
        :class="{ 'palette__item--active': analysis.selectedEntry === i }"
        @click="toggle(i)"
      >
        <span class="palette__number">{{ i + 1 }}</span>
        <span class="palette__pair">
          <span class="swatch swatch--half" :style="{ background: entry.targetHex }" title="Photo colour"></span>
          <span
            class="swatch swatch--half"
            :style="{ background: entry.recipes[entry.chosen]?.hex }"
            title="Mixed paint"
          ></span>
        </span>
        <span class="palette__summary">
          <span class="palette__paints">{{ summary(entry) }}</span>
          <span class="palette__meta">
            {{ Math.round(entry.share * 100) || '<1' }}% of image
            <template v-if="entry.overridden"> · changed</template>
          </span>
        </span>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'

const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()

function summary(entry) {
  const recipe = entry.recipes[entry.chosen]
  if (!recipe) return '–'
  if (!recipe.paints.length) return 'Paper white'
  return recipe.paints.map((p) => paints.byId[p.paintId].name).join(' + ')
}

function toggle(i) {
  analysis.selectEntry(analysis.selectedEntry === i ? null : i)
}
</script>
