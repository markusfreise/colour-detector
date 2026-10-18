<template>
  <!-- Colours for one box: a colour of one's own, or any number from the libraries, by series, name, number or hue. -->
  <dialog ref="dialog" class="card panel addcolour" aria-labelledby="addcolour-title" @click="onBackdrop" @close="emit('closed')">
    <div v-if="box" class="addcolour__body">
      <header class="addcolour__header">
        <h2 id="addcolour-title" class="addcolour__title">{{ t('Add colour') }}</h2>
        <div class="addcolour__actions">
          <button class="button" type="button" :title="t('Clear: empty the search and the filters')" @click="clear">
            <AppIcon name="clear" :label="t('Clear')" />
          </button>
          <button class="flyout__close addcolour__close" type="button" :title="t('Close')" :aria-label="t('Close')" @click="close">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
        </div>
      </header>

      <h3 class="addcolour__heading">{{ t('Own colour') }}</h3>
      <PaintForm v-model="paintForm" :series="seriesNames" :library="formLibrary" :pro="charts" @submit="saveOwn" />

      <h3 class="addcolour__heading">{{ t('Library') }}</h3>
      <div class="addcolour__series" role="group" :aria-label="t('Library')">
        <button
          v-for="section in sections"
          :key="section.id"
          class="button addcolour__series-button"
          :class="{ 'button--active': !hidden.has(section.id) }"
          type="button"
          :aria-pressed="!hidden.has(section.id)"
          @click="toggleSeries(section.id)"
        >
          {{ section.name }}
        </button>
      </div>

      <div class="addcolour__filter">
        <input v-model="query" class="input addcolour__search" type="search" :placeholder="t('Name, number …')" :aria-label="t('Search a colour')" />
        <div class="addcolour__hues" role="group" :aria-label="t('Hue')">
          <button
            v-for="group in HUE_GROUPS"
            :key="group.key"
            class="addcolour__hue"
            :class="{ 'addcolour__hue--active': hue === group.key }"
            :style="{ background: group.hex }"
            type="button"
            :aria-pressed="hue === group.key"
            :title="t(group.name)"
            :aria-label="t(group.name)"
            @click="hue = hue === group.key ? null : group.key"
          ></button>
        </div>
      </div>

      <p v-if="!charts" class="addcolour__note">
        <button class="addcolour__get-pro" type="button" @click="emit('pro', 'brand_charts', 'add colours from the catalogues of known manufacturers')">
          {{ t('Get pro') }}
        </button>
        {{ t('and easily add pre-defined colours from the catalogues of known manufacturers and brands.') }}
      </p>

      <section v-for="section in shown" :key="section.id" class="addcolour__group" :aria-label="section.name">
        <h3 class="addcolour__group-title">{{ section.name }}</h3>
        <ul class="addcolour__list">
          <li v-for="c in section.found" :key="c.key">
            <button
              class="chip addcolour__chip"
              :class="{ 'chip--empty': !c.hex, 'addcolour__chip--in': inBox(c) }"
              :style="chipStyle(c.hex)"
              type="button"
              :aria-pressed="inBox(c)"
              :title="chipTitle(c)"
              @click="pick(c)"
            >
              <span class="chip__strong">{{ paintNumber(c.number) }}</span>
              <span class="chip__text">{{ c.name }}</span>
            </button>
          </li>
        </ul>
      </section>
      <p v-if="!shown.length" class="addcolour__note">{{ t('No colour found') }}</p>
    </div>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { useProStore } from '../stores/pro.js'
import { chipStyle, HUE_GROUPS } from '../lib/color.js'
import { paintNumber, seriesNames as allSeries, seriesColours, filterColours } from '../lib/paintbox.js'
import { PAINT_LIBRARIES, libraryByName } from '../data/libraries.js'
import PaintForm from './PaintForm.vue'
import AppIcon from './AppIcon.vue'
import { useText } from '../i18n/index.js'

// The series switched off, kept while the app is open: whoever adds colours from two makers
// wants those two the next time too.
const hidden = ref(new Set())

const { t, paintName, locale } = useText()
const paints = usePaintsStore()
const pro = useProStore()
const emit = defineEmits(['changed', 'closed', 'pro'])

const dialog = ref(null)
const box = ref(null) // the box the colours go into
const query = ref('')
const hue = ref(null) // key of a HUE_GROUPS entry, or null for every hue
const paintForm = ref(null)

const charts = computed(() => pro.can('brand_charts'))

// The libraries, then every other series the paints of the app come in.
const sections = computed(() => {
  const libraries = PAINT_LIBRARIES.map((library) => ({ id: library.id, name: library.name, catalogue: charts.value ? library.catalogue : [] }))
  const others = [...new Set(paints.all.map((p) => p.vendor).filter((v) => v && !libraryByName(v)))]
    .sort((a, b) => a.localeCompare(b))
    .map((vendor) => ({ id: `vendor:${vendor}`, name: vendor, catalogue: [] }))
  return [...libraries, ...others]
    .map((s) => ({ ...s, colours: seriesColours(s.name, s.catalogue, paints.all, paintName, locale.value) }))
    .filter((s) => s.colours.length)
})

// The series switched on, with the colours that match the search and the hue.
const shown = computed(() =>
  sections.value
    .filter((s) => !hidden.value.has(s.id))
    .map((s) => ({ ...s, found: filterColours(s.colours, query.value, hue.value) }))
    .filter((s) => s.found.length),
)

const seriesNames = computed(() => allSeries(paints.all, PAINT_LIBRARIES))
const formLibrary = computed(() => libraryByName(paintForm.value?.vendor))

const blankForm = () => ({ id: null, vendor: '', number: '', name: '', form: box.value?.id === 'tube' ? 'tube' : 'pan', hex: '#b22727' })

defineExpose({
  open(target) {
    box.value = target
    paintForm.value = blankForm()
    dialog.value.showModal()
  },
  close,
})

function close() {
  dialog.value?.close()
}

function onBackdrop(event) {
  if (event.target === dialog.value) close()
}

function clear() {
  query.value = ''
  hue.value = null
  paintForm.value = blankForm()
}

function toggleSeries(id) {
  const next = new Set(hidden.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  hidden.value = next
}

const inBox = (c) => Boolean(c.paintId && box.value.paintIds.includes(c.paintId))

function chipTitle(c) {
  const text = `${c.vendor} ${paintNumber(c.number)} ${c.name}`
  return c.hex ? text : `${text} · ${t('The chart gives no reliable colour for this paint: set it by hand.')}`
}

// A click puts the colour into the box or takes it out again. A colour the chart has no reliable
// value for goes to the form above, where its colour is set by hand.
async function pick(c) {
  if (inBox(c)) {
    paints.removeFromBox(box.value.id, c.paintId)
  } else if (c.hex) {
    paints.addColourToBox(box.value.id, { vendor: c.vendor, number: c.number, name: c.chartName, hex: c.hex })
  } else {
    paintForm.value = { ...blankForm(), vendor: c.vendor, number: c.number, name: c.chartName }
    await nextTick()
    dialog.value.querySelector('.paint-form__swatch')?.focus()
    dialog.value.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  emit('changed')
}

function saveOwn() {
  paints.savePaint(paintForm.value, box.value.id)
  emit('changed')
  close()
}
</script>
