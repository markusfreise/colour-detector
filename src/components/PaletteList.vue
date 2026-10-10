<template>
  <section class="panel palette">
    <header class="palette__header">
      <h2 class="panel__title">
        Colours
        <span v-if="analysis.entries.length" class="palette__count">
          {{ analysis.entries.length }} in {{ analysis.mixCount }} {{ analysis.mixCount === 1 ? 'mix' : 'mixes' }}
        </span>
      </h2>
      <div class="palette__actions">
        <button class="button button--ghost" type="button" :disabled="!analysis.entries.length" @click="print">
          Print / PDF
        </button>
        <button class="button button--ghost" type="button" @click="emit('show-paintbox')">Show paint box</button>
      </div>
    </header>
    <div v-if="analysis.mixCount < analysis.entries.length" class="palette__options">
      <label class="checkbox"><input v-model="analysis.settings.washes" type="checkbox" /> Washes</label>
      <p v-if="analysis.settings.washes" class="palette__key">
        <span v-for="w in WASH_LETTERS" :key="w.letter"><strong>{{ w.letter }}</strong> {{ w.label }}</span>
      </p>
    </div>
    <ol class="palette__list">
      <li
        v-for="{ entry, i, joinTop, joinBottom, label, share, washes } in rows"
        :key="entry.id"
        class="palette__item"
        :class="{
          'palette__item--active': analysis.selectedEntry === i || (!analysis.settings.washes && analysis.selected?.family === entry.family),
          'palette__item--join-top': joinTop,
          'palette__item--join-bottom': joinBottom,
        }"
        @click="toggle(i)"
      >
        <span class="palette__number">{{ label }}</span>
        <span class="palette__pair">
          <span class="swatch swatch--half" :style="{ background: entry.targetHex }" title="Photo colour"></span>
          <span
            class="swatch swatch--half"
            :style="{ background: entry.recipes[entry.chosen]?.hex }"
            title="Mixed paint"
          ></span>
        </span>
        <span class="palette__summary">
          <span v-if="!joinTop" class="palette__paints">{{ summary(entry) }}</span>
          <span class="palette__meta">
            <template v-if="washes > 1">{{ washes }} washes · </template>
            <template v-else>{{ dilution(entry) }}</template>
            {{ Math.round(share * 100) || '<1' }}% of image
            <template v-if="entry.overridden"> · changed</template>
          </span>
        </span>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { WASH_LETTERS } from '../lib/mixing.js'
import { isNative, sendNative } from '../lib/native.js'

const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()

// Mix by mix, so the washes of one mix sit together. Neighbours painted with the same mix are
// joined: their swatches touch and only the first one names the paints.
const rows = computed(() => {
  const mix = (entry) => `${entry.family}:${entry.recipes[entry.chosen]?.paints.map((p) => p.paintId).join('+')}`
  const list = analysis.order.map((i) => ({ entry: analysis.entries[i], i }))
  if (!analysis.settings.washes) {
    // Only the base colour of each mix: its largest wash, with the area of the whole mix.
    const mixes = new Map()
    for (const row of list) {
      const mix = mixes.get(row.entry.family)
      if (!mix) mixes.set(row.entry.family, { ...row, label: parseInt(row.entry.label), share: row.entry.share, washes: 1 })
      else {
        if (row.entry.share > mix.entry.share) Object.assign(mix, row)
        mix.share += row.entry.share
        mix.washes++
      }
    }
    return [...mixes.values()]
  }
  return list.map((row, n) => ({
    ...row,
    label: row.entry.label,
    share: row.entry.share,
    washes: 1,
    joinTop: n > 0 && mix(list[n - 1].entry) === mix(row.entry),
    joinBottom: n < list.length - 1 && mix(list[n + 1].entry) === mix(row.entry),
  }))
})

// The water level tells the washes of one mix apart.
function dilution(entry) {
  const recipe = entry.recipes[entry.chosen]
  return recipe?.paints.length ? `${recipe.dilution.replace(/ \(.*\)$/, '')} · ` : ''
}

function summary(entry) {
  const recipe = entry.recipes[entry.chosen]
  if (!recipe) return '–'
  if (!recipe.paints.length) return 'Paper white'
  return recipe.paints.map((p) => paints.byId[p.paintId].name).join(' + ')
}

// The print stylesheet lays out the sheet; the browser's dialog offers "Save as PDF".
function print() {
  // window.print() does nothing inside the app's web view; the shell prints it instead.
  if (isNative) sendNative('print')
  else window.print()
}

function toggle(i) {
  analysis.selectEntry(analysis.selectedEntry === i ? null : i)
}
</script>
