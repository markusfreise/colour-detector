<template>
  <section class="panel sidebar" :class="{ 'panel--collapsed': collapsed }">
    <div class="toolbar">
      <PanelToggle name="palette" icon="colours" label="the colours" />
      <button class="button button--ghost" type="button" :data-hint="t('Paint box')" @click="emit('show-paintbox')">
        <AppIcon name="paintbox" />
      </button>
    </div>
    <!-- The colours float over the picture like the settings: dragged by the handle, their place is remembered. -->
    <div v-if="!collapsed" ref="panel" class="card flyout flyout--floating flyout--low" :class="{ 'flyout--dragging': dragging }" :style="style">
      <div class="flyout__handle" :title="t('Drag to move the colours')" @pointerdown="startDrag"></div>
      <button class="flyout__close" type="button" :title="t('Close')" :aria-label="t('Close the colours')" @click="layout.toggle('palette')">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
      <h2 class="panel__title">
        {{ t('Colours') }}
        <span v-if="analysis.entries.length" class="palette__count">
          {{ t(analysis.mixCount === 1 ? '{n} in {mixes} mix' : '{n} in {mixes} mixes', { n: analysis.entries.length, mixes: analysis.mixCount }) }}
        </span>
      </h2>
    <div v-show="!collapsed" class="palette__body">
    <p v-if="analysis.mixCount < analysis.entries.length" class="palette__key">
      <span v-for="w in WASH_LETTERS" :key="w.letter"><strong>{{ w.letter }}</strong> {{ t(w.label) }}</span>
    </p>
    <ol class="palette__list">
      <li
        v-for="mix in mixes"
        :key="mix.family"
        class="palette__item"
        :class="{ 'palette__item--active': analysis.selected?.family === mix.family }"
      >
        <button class="palette__mix" type="button" @click="toggle(mix.base)">
          <span class="palette__number">{{ mix.number }}</span>
          <span class="swatch palette__base" :style="{ background: mix.hex }" :title="mix.hexTitle"></span>
          <span class="palette__summary">
            <span class="palette__paints">
              <template v-for="(paint, i) in mix.paints" :key="paint.id">
                <template v-if="i"> + </template><strong>{{ paint.number }}</strong> {{ paint.name }}
              </template>
              <template v-if="!mix.paints.length">{{ mix.names }}</template>
            </span>
            <span class="palette__meta">
              <template v-if="mix.washes.length > 1">{{ t('{n} washes · ', { n: mix.washes.length }) }}</template>
              <template v-else-if="mix.dilution">{{ mix.dilution }} · </template>
              {{ t('{percent}% of image', { percent: percent(mix.share) }) }}
              <template v-if="mix.changed">{{ t(' · changed') }}</template>
              <!-- Its tone in the blocking, and a warning when the mix lands in another one: value matters more than hue. -->
              <template v-if="toneOf(mix)"> · {{ t('tone {n}', { n: toneOf(mix).tone }) }}</template>
            </span>
            <span v-if="toneOf(mix)?.warning" class="palette__tone-warning">
              {{ toneOf(mix).warning === 'lighter' ? t('The mix is lighter than its tone in the blocking') : t('The mix is darker than its tone in the blocking') }}
            </span>
          </span>
        </button>
        <!-- The recipe as a bar: one segment per paint, as wide as its part of the mix. -->
        <div v-if="mix.paints.length" class="palette__bar" role="img" :aria-label="t('Recipe: {recipe}', { recipe: mix.recipeText })">
          <span
            v-for="paint in mix.paints"
            :key="paint.id"
            class="palette__part"
            :style="{ flexGrow: paint.share, background: paint.hex, color: paint.ink }"
            :title="paint.title"
          >
            <span class="palette__part-text">{{ paint.parts }}</span>
          </span>
        </div>
        <!-- Its washes, lightest first; each one selects that wash. -->
        <div v-if="mix.washes.length > 1" class="palette__bar palette__bar--washes">
          <button
            v-for="wash in mix.washes"
            :key="wash.index"
            class="palette__wash"
            :class="{ 'palette__wash--active': analysis.selectedEntry === wash.index }"
            type="button"
            :style="{ background: wash.hex, color: wash.ink }"
            :title="t('{label}: {dilution}, {percent}% of image', { label: wash.label, dilution: wash.dilution, percent: percent(wash.share) })"
            @click="toggle(wash.index)"
          >
            {{ wash.letter }}
          </button>
        </div>
      </li>
    </ol>
    </div>
    </div>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useProStore } from '../stores/pro.js'
import { toneOf as toneOfLightness, lightnessOf } from '../lib/blocking.js'
import { hexToRgb } from '../lib/color.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { WASH_LETTERS } from '../lib/recipeText.js'
import { contrastText } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'
import AppIcon from './AppIcon.vue'
import { useLayoutStore } from '../stores/layout.js'
import PanelToggle from './PanelToggle.vue'
import { useFloating } from './floating.js'
import { useText } from '../i18n/index.js'

const { t, paintName, region } = useText()
const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()
const layout = useLayoutStore()
const pro = useProStore()
// With Blocking at hand, the tones are worked out in the background, for the tone of every mix.
watch(
  () => pro.can('blocking') && analysis.entries.length > 0 && !analysis.layerMode,
  (wanted) => wanted && analysis.ensureBlocking(),
  { immediate: true },
)
watch(
  () => analysis.blockingKey,
  () => pro.can('blocking') && analysis.entries.length && !analysis.layerMode && analysis.ensureBlocking(),
)
// { tone, warning } of a mix (its largest wash), or null without a blocking.
function toneOf(mix) {
  const thresholds = analysis.blockingResult?.thresholds
  const entry = analysis.entries[mix.base]
  if (!thresholds || !entry || !pro.can('blocking')) return null
  return { tone: toneOfLightness(lightnessOf(...hexToRgb(entry.targetHex)), thresholds) + 1, warning: analysis.toneWarning(entry) }
}
const collapsed = computed(() => !!layout.collapsed.palette)
const { panel, style, dragging, startDrag } = useFloating('colours')

const percent = (share) => Math.round(share * 100) || '<1'
const formatParts = (n) => (Number.isInteger(n) ? String(n) : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const shortDilution = (recipe) => t(recipe.dilution).replace(/ \(.*\)$/, '')

// One block per mix: its base colour, its recipe as a bar of paints, and its washes.
const mixes = computed(() => {
  const byFamily = new Map()
  for (const index of analysis.order) {
    const entry = analysis.entries[index]
    if (!byFamily.has(entry.family)) byFamily.set(entry.family, [])
    byFamily.get(entry.family).push({ entry, index })
  }
  return [...byFamily.entries()].map(([family, members]) => {
    // The base colour is the largest wash: the one the recipe is fitted to.
    const base = members.reduce((x, y) => (y.entry.share > x.entry.share ? y : x))
    const own = base.entry.recipes[base.entry.chosen]
    // The mix as its recipe gives it, before any water is added or taken away.
    const recipe = (base.entry.overridden ? null : analysis.mixRecipes[base.entry.group]?.[base.entry.chosen]) ?? own
    const used = (recipe?.paints ?? []).map((item, i) => {
      const paint = paints.byId[item.paintId]
      const parts = formatParts(recipe.parts[i])
      return {
        id: item.paintId,
        share: item.share,
        hex: paint.hex,
        ink: contrastText(paint.hex),
        parts,
        name: paintName(paint),
        number: paintNumber(paint.number),
        title: `${parts} x ${paintNumber(paint.number)} ${paintName(paint)}`,
      }
    })
    return {
      family,
      number: parseInt(base.entry.label),
      base: base.index,
      // One paint in several washes: the paint as it is, since no single wash is "the" colour.
      // Otherwise the mix as its recipe gives it.
      hex: used.length === 1 && members.length > 1 ? used[0].hex : (recipe?.hex ?? base.entry.targetHex),
      hexTitle:
        used.length === 1 && members.length > 1
          ? t('Colour of the paint: {hex}', { hex: used[0].hex })
          : t('Base colour of the mix: {hex}', { hex: recipe?.hex ?? base.entry.targetHex }),
      // Shown in place of the paints when there are none.
      names: recipe ? t('Paper white') : '–',
      recipeText: used.map((p) => p.title).join(', '),
      paints: used,
      dilution: own?.paints.length ? shortDilution(own) : '',
      share: members.reduce((sum, m) => sum + m.entry.share, 0),
      changed: members.some((m) => m.entry.overridden),
      washes: members.map(({ entry, index }) => {
        const wash = entry.recipes[entry.chosen]
        const hex = wash?.hex ?? entry.targetHex
        return { index, label: entry.label, letter: entry.letter, hex, ink: contrastText(hex), share: entry.share, dilution: wash ? shortDilution(wash) : '' }
      }),
    }
  })
})

function toggle(i) {
  analysis.selectEntry(analysis.selectedEntry === i ? null : i)
}
</script>
