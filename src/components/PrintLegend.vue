<template>
  <section class="legend">
    <h2 class="legend__title">{{ t('{name} – colours and mixes', { name: analysis.imageName }) }}</h2>
    <p v-if="rows.some((row) => row.washes.length > 1)" class="legend__key">
      <span v-for="w in WASH_LETTERS" :key="w.letter"><strong>{{ w.letter }}</strong> {{ t(w.label) }}</span>
    </p>
    <ol class="legend__list">
      <li v-for="row in rows" :key="row.key" class="legend__item">
        <span class="legend__number">{{ row.number }}</span>
        <!-- The washes of the mix side by side, lightest first, each in its own colour. -->
        <div class="legend__washes">
          <span v-for="wash in row.washes" :key="wash.label" class="legend__wash" :style="{ background: wash.hex, color: wash.ink }">
            <strong>{{ wash.letter || row.number }}</strong>
            <span>{{ percent(wash.share) }}%</span>
          </span>
        </div>
        <div class="legend__recipe">
          <template v-if="row.paints.length">
            <ul class="legend__paints">
              <li v-for="paint in row.paints" :key="paint.id" class="chip chip--row legend__paint" :style="chipStyle(paint.hex)">
                <span class="chip__strong">{{ paint.parts }} x {{ paint.forms }}</span>
                <span class="chip__text"><span class="chip__strong">{{ paint.number }}</span> {{ paintName(paint.paint) }}</span>
              </li>
            </ul>
            <!-- The recipe as a bar: one segment per paint, as wide as its part of the mix. -->
            <div class="legend__bar">
              <span
                v-for="paint in row.paints"
                :key="paint.id"
                class="legend__part"
                :style="{ flexGrow: paint.share, background: paint.hex, color: paint.ink }"
              >
                {{ paint.parts }}
              </span>
            </div>
          </template>
          <p v-else class="legend__paper">{{ t('Leave the paper white') }}</p>
        </div>
        <span class="legend__share">{{ percent(row.share) }}%</span>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { WASH_LETTERS } from '../lib/mixing.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const analysis = useAnalysisStore()
const paints = usePaintsStore()

const percent = (share) => Math.round(share * 100) || '<1'
const formatParts = (n) => (Number.isInteger(n) ? String(n) : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

// One row per mix: its washes share the recipe and differ only in water, so the paints are listed once.
const rows = computed(() => {
  const byFamily = new Map()
  for (const index of analysis.order) {
    const entry = analysis.entries[index]
    if (!byFamily.has(entry.family)) byFamily.set(entry.family, [])
    byFamily.get(entry.family).push(entry)
  }
  return [...byFamily.entries()].map(([family, members]) => {
    const base = members.reduce((x, y) => (y.share > x.share ? y : x))
    // The mix as its recipe gives it, before any water is added or taken away.
    const recipe = (base.overridden ? null : analysis.mixRecipes[base.group]?.[base.chosen]) ?? base.recipes[base.chosen]
    return {
      key: family,
      number: parseInt(base.label),
      share: members.reduce((sum, e) => sum + e.share, 0),
      washes: members.map((entry) => {
        const hex = entry.recipes[entry.chosen]?.hex ?? entry.targetHex
        return { label: entry.label, letter: entry.letter, hex, ink: contrastText(hex), share: entry.share }
      }),
      paints: (recipe?.paints ?? []).map((item, i) => {
        const paint = paints.byId[item.paintId]
        return {
          id: item.paintId,
          share: item.share,
          hex: paint.hex,
          ink: contrastText(paint.hex),
          parts: formatParts(recipe.parts[i]),
          forms: paintForms(paint),
          number: paintNumber(paint.number),
          paint,
        }
      }),
    }
  })
})
</script>
