<template>
  <section
    ref="panel"
    class="panel palette"
    :class="{ 'panel--collapsed': collapsed, 'palette--dragging': dragging }"
    :style="layout.palette ? { left: `${layout.palette.x}px`, top: `${layout.palette.y}px`, right: 'auto', bottom: 'auto' } : null"
  >
    <!-- The header is the handle: the colours float over the page and are dragged by it. -->
    <header class="palette__header" title="Drag to move" @pointerdown="startDrag">
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
        <PanelToggle name="palette" label="the colours" />
      </div>
    </header>
    <div v-show="!collapsed" class="palette__body">
    <p v-if="analysis.mixCount < analysis.entries.length" class="palette__key">
      <span v-for="w in WASH_LETTERS" :key="w.letter"><strong>{{ w.letter }}</strong> {{ w.label }}</span>
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
          <span class="swatch palette__base" :style="{ background: mix.hex }" :title="`Base colour of the mix: ${mix.hex}`"></span>
          <span class="palette__summary">
            <span class="palette__paints">
              <template v-for="(paint, i) in mix.paints" :key="paint.id">
                <template v-if="i"> + </template><strong>{{ paint.number }}</strong> {{ paint.name }}
              </template>
              <template v-if="!mix.paints.length">{{ mix.names }}</template>
            </span>
            <span class="palette__meta">
              <template v-if="mix.washes.length > 1">{{ mix.washes.length }} washes · </template>
              <template v-else-if="mix.dilution">{{ mix.dilution }} · </template>
              {{ percent(mix.share) }}% of image
              <template v-if="mix.changed"> · changed</template>
            </span>
          </span>
        </button>
        <!-- The recipe as a bar: one segment per paint, as wide as its part of the mix. -->
        <div v-if="mix.paints.length" class="palette__bar" role="img" :aria-label="`Recipe: ${mix.recipeText}`">
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
            :title="`${wash.label}: ${wash.dilution}, ${percent(wash.share)}% of image`"
            @click="toggle(wash.index)"
          >
            {{ wash.letter }}
          </button>
        </div>
      </li>
    </ol>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { WASH_LETTERS } from '../lib/mixing.js'
import { contrastText } from '../lib/color.js'
import { paintNumber } from '../lib/paintbox.js'
import { isNative, sendNative } from '../lib/native.js'
import { useLayoutStore } from '../stores/layout.js'
import PanelToggle from './PanelToggle.vue'

const emit = defineEmits(['show-paintbox'])
const analysis = useAnalysisStore()
const paints = usePaintsStore()
const layout = useLayoutStore()
const collapsed = computed(() => !!layout.collapsed.palette)

// Dragging by the header. The panel only floats on wide windows; in one column it is part of the page.
const MARGIN = 8 // what stays between the panel and the edge of the window
const panel = ref(null)
const dragging = ref(false)
let grip = null

// A position that keeps the panel inside the window.
function inWindow(x, y) {
  const rect = panel.value.getBoundingClientRect()
  return {
    x: Math.round(Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - rect.width - MARGIN))),
    y: Math.round(Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN))),
  }
}

function startDrag(event) {
  if (event.button || event.target.closest('button')) return
  if (getComputedStyle(panel.value).position !== 'fixed') return
  const rect = panel.value.getBoundingClientRect()
  grip = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.addEventListener('pointermove', drag)
  event.currentTarget.addEventListener('pointerup', endDrag)
  event.currentTarget.addEventListener('pointercancel', endDrag)
  event.preventDefault()
}

function drag(event) {
  layout.palette = inWindow(event.clientX - grip.x, event.clientY - grip.y)
}

function endDrag(event) {
  event.currentTarget.removeEventListener('pointermove', drag)
  event.currentTarget.removeEventListener('pointerup', endDrag)
  event.currentTarget.removeEventListener('pointercancel', endDrag)
  dragging.value = false
  if (layout.palette) layout.movePalette(layout.palette)
}

// A smaller window must not leave the panel outside it.
function keepInWindow() {
  if (layout.palette && panel.value && getComputedStyle(panel.value).position === 'fixed') {
    layout.palette = inWindow(layout.palette.x, layout.palette.y)
  }
}
onMounted(() => {
  keepInWindow()
  window.addEventListener('resize', keepInWindow)
})
onBeforeUnmount(() => window.removeEventListener('resize', keepInWindow))

const percent = (share) => Math.round(share * 100) || '<1'
const formatParts = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const shortDilution = (recipe) => recipe.dilution.replace(/ \(.*\)$/, '')

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
        name: paint.name,
        number: paintNumber(paint.number),
        title: `${parts} x ${paintNumber(paint.number)} ${paint.name}`,
      }
    })
    return {
      family,
      number: parseInt(base.entry.label),
      base: base.index,
      hex: recipe?.hex ?? base.entry.targetHex,
      // Shown in place of the paints when there are none.
      names: recipe ? 'Paper white' : '–',
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
