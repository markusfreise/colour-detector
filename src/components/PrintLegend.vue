<template>
  <section class="legend">
    <header class="legend__head">
      <div>
        <h2 class="legend__title">{{ t('{name} – colours and mixes', { name: analysis.imageName }) }}</h2>
        <p class="legend__key">
          <span v-for="w in WASH_LETTERS" :key="w.letter"><strong>{{ w.letter }}</strong> {{ t(w.label) }}</span>
        </p>
      </div>
      <!-- A link with these settings and paints (lib/restoreLink.js); the SVG is made by qrcode-generator. -->
      <figure v-if="qr" class="legend__restore">
        <span class="legend__qr" v-html="qr"></span>
        <figcaption>{{ t('Scan to bring back these paints and settings, then open the photo again.') }}</figcaption>
      </figure>
    </header>
    <ol class="legend__list">
      <li v-for="row in rows" :key="row.key" class="legend__item">
        <!-- At the top: the base colour (the concentrated wash) with its number, then the other washes, darkest first. -->
        <div class="legend__washes">
          <span class="legend__base" :style="{ background: row.hex, color: row.ink }">
            <strong class="legend__number">{{ row.number }}</strong>
            <span><strong>{{ CONCENTRATED }}</strong><template v-if="row.baseShare !== null">&nbsp;{{ percent(row.baseShare) }}%</template></span>
          </span>
          <span v-for="wash in row.washes" :key="wash.label" class="legend__wash" :style="{ background: wash.hex, color: wash.ink }">
            <strong>{{ wash.letter }}</strong>
            <span>{{ percent(wash.share) }}%</span>
          </span>
        </div>
        <template v-if="row.paints.length">
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
          <ul class="legend__paints">
            <li v-for="paint in row.paints" :key="paint.id" class="chip chip--row legend__paint" :style="chipStyle(paint.hex)">
              <span class="chip__strong legend__amount">{{ paint.parts }} x {{ paint.forms }}</span>
              <span class="chip__text"><span class="chip__strong">{{ paint.number }}</span> {{ paintName(paint.paint) }}</span>
            </li>
          </ul>
        </template>
        <p v-else class="legend__paper">{{ t('Leave the paper white') }}</p>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import { useAnalysisStore } from '../stores/analysis.js'
import { usePaintsStore } from '../stores/paints.js'
import { WASH_LETTERS, MAX_AMOUNT, mixHex } from '../lib/mixing.js'
import { chipStyle, contrastText } from '../lib/color.js'
import { paintNumber, paintForms } from '../lib/paintbox.js'
import { useText } from '../i18n/index.js'
import { defaultSettings } from '../stores/analysis.js'
import { restoreCode, restoreLink, QR_LEVEL } from '../lib/restoreLink.js'
import { isNative } from '../lib/native.js'

const { t, paintName, region } = useText()
const analysis = useAnalysisStore()
const paints = usePaintsStore()

const percent = (share) => Math.round(share * 100) || '<1'
const formatParts = (n) => (Number.isInteger(n) ? String(n) : n.toLocaleString(region.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

const baseHex = (entry) => entry.recipes[entry.chosen]?.hex ?? entry.targetHex
const CONCENTRATED = WASH_LETTERS.at(-1).letter
const washRank = (entry) => WASH_LETTERS.findIndex((w) => w.letter === entry.letter)
// The mix with its strongest paint at strength 1: the darkest it is ever used.
const fullStrength = (recipe) => {
  if (!recipe?.paints.length) return recipe?.hex
  const most = Math.max(...recipe.paints.map((p) => p.amount))
  return mixHex(recipe.paints.map((p) => paints.byId[p.paintId]), recipe.paints.map((p) => (p.amount / most) * MAX_AMOUNT))
}

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
    // The base colour is the concentrated wash; without one, the mix at full strength, as a C wash would be.
    const concentrated = members.find((e) => e.letter === CONCENTRATED || !e.letter)
    const hex = concentrated ? baseHex(concentrated) : fullStrength(recipe) ?? base.targetHex
    return {
      key: family,
      number: parseInt(base.label),
      baseShare: concentrated ? concentrated.share : null,
      hex,
      ink: contrastText(hex),
      washes: members
        .filter((entry) => entry !== concentrated)
        .sort((a, b) => washRank(b) - washRank(a))
        .map((entry) => {
          const hex = baseHex(entry)
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

// The QR code at the top: the settings and paints as a link, kept up to date while they change.
// From the app it points to the website, which restores them.
const qr = ref('')
const base = isNative ? 'https://watercolourlove.de/' : window.location.origin + window.location.pathname
watch(
  () => [analysis.settings, paints.palette],
  async () => {
    const code = await restoreCode({ settings: analysis.settings, defaults: defaultSettings(), palette: paints.palette, paints: paints.all })
    const symbol = qrcode(0, QR_LEVEL)
    symbol.addData(restoreLink(base, code))
    symbol.make()
    qr.value = symbol.createSvgTag({ cellSize: 1, margin: 4, scalable: true })
  },
  { deep: true, immediate: true },
)
</script>
