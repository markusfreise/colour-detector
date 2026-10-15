<template>
  <dialog ref="dialog" class="card panel paintbox" aria-labelledby="paintbox-title" @click="onBackdrop" @close="onClose">
    <div class="paintbox__body">
      <header class="paintbox__header">
        <h2 id="paintbox-title" class="panel__title">{{ layerMode ? t('Paint box: base paints') : t('Paint box') }}</h2>
        <div class="paintbox__actions">
          <button
            class="button"
            :class="autoOn ? 'button--active' : 'button--ghost'"
            type="button"
            :aria-pressed="autoOn"
            :title="layerMode ? t('Auto: let the app choose the base paints for this picture') : t('Auto: let the app select the paints that suit each picture')"
            :disabled="!analysis.pixels"
            @click="auto"
          >
            <AppIcon name="auto" :label="t('Auto')" />
          </button>
          <button v-if="!layerMode" class="button button--ghost" type="button" :title="t('Revert: back to the standard selection')" @click="reset">
            <AppIcon name="reset" :label="t('Revert')" />
          </button>
          <button class="button button--ghost" type="button" :title="t('Clear: select no paint')" @click="clear">
            <AppIcon name="clear" :label="t('Clear')" />
          </button>
          <button
            class="button"
            :class="dirty ? 'button--active' : 'button--ghost'"
            type="button"
            :disabled="!dirty"
            :title="layerMode ? t('Update layers') : t('Update mixes')"
            @click="apply"
          >
            <AppIcon name="update" :label="layerMode ? t('Update layers') : t('Update mixes')" />
          </button>
          <button class="flyout__close paintbox__close" type="button" :title="t('Close')" :aria-label="t('Close')" @click="close">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
            </svg>
          </button>
        </div>
      </header>

      <p v-if="layerMode" class="paintbox__note">
        {{
          t('Layer mode paints with a few base paints, one layer each ({n} of {max}). They are kept apart from the paints selected for mixing.', {
            n: selected.length,
            max: MAX_LAYER_PAINTS,
          })
        }}
        <template v-if="full">{{ t(' {max} layers at most: remove one before adding another.', { max: MAX_LAYER_PAINTS }) }}</template>
      </p>
      <!-- The palette: the paints of this picture, saved with it. -->
      <div class="paintbox__group paintbox__group--selected" :aria-label="layerMode ? t('Base paints') : t('Palette')">
        <h3 class="paintbox__group-title">{{ layerMode ? t('Base paints') : t('Palette') }}</h3>
        <ul v-if="selected.length" class="paintbox__list">
          <li v-for="p in selected" :key="p.id">
            <PaintChip :paint="p" enabled show-form :used="!layerMode && analysis.usedPaintIds.has(p.id)" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">
          {{ layerMode ? t('No base paints chosen. Click a paint below to add it, or press Auto.') : t('No paints selected. Click a paint below to add it.') }}
        </p>
        <p v-if="!layerMode && selected.length >= pro.paintLimit" class="paintbox__note paintbox__limit">
          {{ t('Maximum number of colours reached.') }}
          <button class="paintbox__get-pro" type="button" @click="pro.require(false, `mix from more than ${FREE_PAINTS} paints`)">{{ t('Get Pro') }}</button>
          {{ t('to lift this limit.') }}
        </p>
        <p v-if="!layerMode" class="paintbox__note">{{ t('The palette is saved with the picture.') }}</p>
      </div>

      <div class="paintbox__boxes">
        <button class="button button--ghost" type="button" @click="startNewBox">{{ t('New paint box') }}</button>
        <label class="button button--ghost paintbox__import">
          {{ t('Import paint box') }}
          <input class="paintbox__file" type="file" accept="application/json,.json" @click="onImportClick" @change="importBox" />
        </label>
      </div>
      <form v-if="newBox" class="paintbox__edit" @submit.prevent="createBox">
        <input ref="newBoxField" v-model="boxName" class="input" type="text" maxlength="40" :placeholder="t('Name of the box')" :aria-label="t('Name of the box')" />
        <button class="button" type="submit">{{ t('Create box') }}</button>
        <button class="button button--ghost" type="button" @click="newBox = false">{{ t('Cancel') }}</button>
      </form>
      <p v-if="importError" class="paintbox__error" role="alert">{{ importError }}</p>

      <section v-for="{ box, size, list } in boxLists" :key="box.id" class="paintbox__group" :aria-label="t(box.name)">
        <div class="paintbox__group-header">
          <h3 class="paintbox__group-title">{{ t(box.name) }}</h3>
          <label class="checkbox" :title="t('Let Auto choose from {group}', { group: t(box.name) })">
            <input type="checkbox" :checked="!autoOff.has(box.id)" @change="setAutoBox(box.id, $event.target.checked)" />
            {{ t('Use for Auto') }}
          </label>
        </div>
        <p v-if="removing === box.id" class="paintbox__note">{{ t('Click a colour to take it out of this box.') }}</p>
        <ul class="paintbox__list">
          <li v-for="p in list" :key="p.id">
            <PaintChip
              :paint="p"
              :disabled="removing !== box.id && full"
              :class="{ 'paintbox__chip--removing': removing === box.id }"
              @toggle="removing === box.id ? removeFromBox(box.id, p.id) : toggle(p.id, $event)"
            />
          </li>
          <!-- An empty place at the end: a colour more for this box. -->
          <li v-if="removing !== box.id">
            <button
              class="paintbox__add"
              :class="{ 'paintbox__add--open': addingTo === box.id }"
              type="button"
              :aria-expanded="addingTo === box.id"
              :title="t('Add a colour to {box}', { box: t(box.name) })"
              :aria-label="t('Add a colour to {box}', { box: t(box.name) })"
              @click="toggleAdding(box.id)"
            >
              <span aria-hidden="true">+</span>
            </button>
          </li>
        </ul>
        <p v-if="size && !list.length" class="paintbox__empty">{{ t('All of these are selected.') }}</p>

        <div v-if="addingTo === box.id" class="paintbox__adding">
          <ColourSearch
            :ref="(el) => (search = el)"
            :options="optionsFor(box)"
            :label="t('Search a colour')"
            :placeholder="t('Series, number or name')"
            @pick="pickColour(box, $event)"
          />
          <p v-if="!pro.active" class="paintbox__note">
            <button class="paintbox__get-pro" type="button" @click="pro.require(false, 'add colours from the catalogues of known manufacturers')">
              {{ t('Get pro') }}
            </button>
            {{ t('and easily add pre-defined colours from the catalogues of known manufacturers and brands.') }}
          </p>
          <button v-if="formAt !== box.id" class="paintbox__get-pro" type="button" @click="startPaint(null, box.id)">{{ t('Or enter a colour of your own') }}</button>
          <template v-if="formAt === box.id">
            <h4 class="paintbox__form-title">{{ t('A colour of your own') }}</h4>
            <PaintForm v-model="paintForm" :series="series" :library="library" :pro="pro.active" @submit="savePaint" @cancel="paintForm = null" />
          </template>
        </div>

        <div class="paintbox__box-actions">
          <form v-if="renaming === box.id" class="paintbox__edit" @submit.prevent="saveName(box.id)">
            <input v-model="boxName" class="input" type="text" maxlength="40" :aria-label="t('Name of the box')" />
            <button class="button" type="submit">{{ t('Save name') }}</button>
            <button class="button button--ghost" type="button" @click="renaming = null">{{ t('Cancel') }}</button>
          </form>
          <template v-else>
            <button class="paintbox__box-action" type="button" @click="startRename(box)">{{ t('Rename') }}</button>
            <button v-if="box.paintIds.length" class="paintbox__box-action" type="button" :aria-pressed="removing === box.id" @click="toggleRemoving(box.id)">
              {{ removing === box.id ? t('Done') : t('Remove colours') }}
            </button>
            <button v-if="!isNative && box.paintIds.length" class="paintbox__box-action" type="button" @click="exportBox(box)">{{ t('Export') }}</button>
            <button v-if="paints.boxes.length > 1" class="paintbox__box-action paintbox__box-action--danger" type="button" @click="deleteBox(box.id)">
              {{ confirming === `box:${box.id}` ? t('Really delete?') : t('Delete box') }}
            </button>
          </template>
        </div>
      </section>

      <!-- One's own paints, with what is done with them: edited here, put into boxes with the + of a box. -->
      <div v-if="paints.custom.length" class="paintbox__group">
        <h3 class="paintbox__group-title">{{ t('Your own paints') }}</h3>
        <PaintForm v-if="formAt === 'own'" v-model="paintForm" :series="series" :library="library" :pro="pro.active" @submit="savePaint" @cancel="paintForm = null" />
        <ul class="paintbox__own">
          <!-- One paint per row: the colour itself carries what is done with it. -->
          <li v-for="p in paints.custom" :key="p.id" class="chip chip--row paintbox__own-chip" :style="chipStyle(p.hex)">
            <span class="paintbox__own-lines">
              <span class="chip__text"><span class="chip__strong">{{ paintNumber(p.number) }}</span> {{ paintName(p) }}</span>
              <span class="chip__text paintbox__own-vendor">{{ p.vendor }} · {{ paintForms(p) === 'P' ? t('Pan') : t('Tube') }}</span>
            </span>
            <span class="paintbox__own-actions">
              <button class="paintbox__own-action" type="button" :title="t('Edit this paint')" @click="startPaint(p, 'own')">
                <AppIcon name="edit" :label="t('Edit this paint')" />
              </button>
              <button
                class="paintbox__own-action"
                :class="{ 'paintbox__own-action--armed': confirming === p.id }"
                type="button"
                :title="confirming === p.id ? t('Press again to delete this paint') : t('Delete this paint')"
                @click="deletePaint(p.id)"
              >
                <AppIcon name="trash" :label="confirming === p.id ? t('Press again to delete this paint') : t('Delete this paint')" />
              </button>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useProStore, FREE_PAINTS } from '../stores/pro.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber, paintForms, sortPaints, sortBoxPaints, seriesNames, HOUSE_VENDOR } from '../lib/paintbox.js'
import { PAINT_LIBRARIES, libraryByName } from '../data/libraries.js'
import { isNative } from '../lib/native.js'
import PaintChip from './PaintChip.vue'
import PaintForm from './PaintForm.vue'
import ColourSearch from './ColourSearch.vue'
import AppIcon from './AppIcon.vue'
import { useText } from '../i18n/index.js'

const { t, paintName } = useText()
const paints = usePaintsStore()
const analysis = useAnalysisStore()
const pro = useProStore()
const dirty = ref(false)
const dialog = ref(null)
const newBox = ref(false) // the name field of a new box is open
const newBoxField = ref(null)
const boxName = ref('') // the name being entered, for a new box or a renamed one
const renaming = ref(null) // id of the box being renamed
const removing = ref(null) // id of the box whose colours are being taken out
const addingTo = ref(null) // id of the box a colour is being added to
const search = ref(null)
const paintForm = ref(null) // the paint being added or edited
const formAt = ref(null) // where that form is: a box id, or 'own' for editing one's own paint
const confirming = ref(null) // 'box:<id>' or a paint id: the delete button was clicked once
const importError = ref('')

// In layer mode the dialog edits the base paints of the palette instead of its selection for mixing.
const layerMode = computed(() => analysis.layerMode)
const autoOn = computed(() => (layerMode.value ? paints.palette.layerAuto : paints.palette.auto))
const selected = computed(() => (layerMode.value ? sortPaints(paints.layerPaints) : paints.selected))
const autoOff = computed(() => new Set(paints.palette.autoOff))
const full = computed(() => layerMode.value && paints.palette.layerIds.length >= MAX_LAYER_PAINTS)

// Every box with the paints that are not in the palette; those are at the top already.
const boxLists = computed(() => {
  const inPalette = layerMode.value ? new Set(paints.palette.layerIds) : paints.enabledIds
  return paints.boxes.map((box) => {
    const own = box.paintIds.map((id) => paints.byId[id]).filter(Boolean)
    // While colours are being taken out, all of them, those in the palette too.
    const list = removing.value === box.id ? own : own.filter((p) => !inPalette.has(p.id))
    return { box, size: own.length, list: sortBoxPaints(box, list) }
  })
})

// What the colour search offers: every paint the app knows, and with Pro the colours of the
// libraries that are not among them yet.
const searchOptions = computed(() => {
  const label = (vendor, number, name) => `${vendor} ${paintNumber(number)} ${name}`
  const known = new Set(paints.all.map((p) => `${p.vendor.toLowerCase()}|${String(p.number).toLowerCase()}`))
  const options = paints.all.map((p) => {
    const text = label(p.vendor, p.number, paintName(p))
    return { key: p.id, kind: 'paint', id: p.id, hex: p.hex, label: text, search: `${text} ${p.name} ${p.nameDe ?? ''}`.toLowerCase() }
  })
  if (pro.active) {
    for (const library of PAINT_LIBRARIES) {
      for (const colour of library.catalogue) {
        if (known.has(`${library.name.toLowerCase()}|${String(colour.number).toLowerCase()}`)) continue
        options.push({
          key: `${library.id}:${colour.number}`,
          kind: 'colour',
          colour: { vendor: library.name, number: colour.number, name: colour.name, hex: colour.hex },
          hex: colour.hex,
          label: label(library.name, colour.number, colour.name),
          note: t('Catalogue'),
        })
      }
    }
  }
  return options
})
const optionsFor = (box) => searchOptions.value.filter((o) => o.kind !== 'paint' || !box.paintIds.includes(o.id))

defineExpose({ open: () => dialog.value.showModal() })

// A click on the dialog element itself (not its content) hit the backdrop.
function onBackdrop(event) {
  if (event.target === dialog.value) close()
}

// Closing with pending changes applies them, so the recipes never lag behind the selection.
function close() {
  onClose()
  dialog.value.close()
}

// Also covers Esc, which closes the dialog without going through close().
function onClose() {
  if (dirty.value) apply()
  confirming.value = null
}

function toggle(id, on) {
  if (layerMode.value) {
    if (on && full.value) return // the chip stays unticked; the note above says why
    paints.toggleLayerPaint(id, on)
  } else {
    if (on && !pro.require(paints.enabledIds.size < pro.paintLimit, `mix from more than ${FREE_PAINTS} paints`)) return
    paints.toggle(id, on)
  }
  dirty.value = true
}

// A box joins or leaves the paints Auto chooses from; with Auto on, the choice is made again.
function setAutoBox(id, on) {
  paints.setAutoBox(id, on)
  if (autoOn.value && analysis.pixels) auto()
}

// Let the app pick the paints for the current picture, from the boxes ticked for Auto.
function auto() {
  if (layerMode.value) {
    // The proposal needs the picture, so it is made while the layers are planned again.
    analysis.proposeLayers()
    dirty.value = false
    return
  }
  analysis.autoPaints(true)
  dirty.value = true
}

function clear() {
  if (layerMode.value) paints.setLayerPaints([])
  else paints.clear()
  dirty.value = true
}

function reset() {
  paints.reset()
  dirty.value = true
}

function apply() {
  analysis.recomputeAllRecipes()
  dirty.value = false
}

// With Auto on, what the boxes hold is what it chooses from.
function boxesChanged() {
  if (autoOn.value) dirty.value = true
}

// Boxes of one's own are part of the full version. The purchase dialog is a modal of its own;
// this one would cover it.
function mayAddBox() {
  if (pro.require(pro.active, 'add paint boxes of your own')) return true
  dialog.value.close()
  return false
}

async function startNewBox() {
  if (!mayAddBox()) return
  boxName.value = ''
  newBox.value = true
  await nextTick()
  newBoxField.value?.focus()
}

function createBox() {
  paints.addBox(boxName.value)
  newBox.value = false
}

function startRename(box) {
  boxName.value = t(box.name)
  renaming.value = box.id
}

function saveName(id) {
  paints.renameBox(id, boxName.value)
  renaming.value = null
}

function deleteBox(id) {
  if (confirming.value !== `box:${id}`) {
    confirming.value = `box:${id}`
    return
  }
  paints.deleteBox(id)
  confirming.value = null
  boxesChanged()
}

async function toggleAdding(id) {
  addingTo.value = addingTo.value === id ? null : id
  if (formAt.value !== 'own') paintForm.value = null
  if (!addingTo.value) return
  await nextTick()
  search.value?.focus()
}

function toggleRemoving(id) {
  removing.value = removing.value === id ? null : id
  if (removing.value) addingTo.value = null
}

function pickColour(box, option) {
  if (option.kind === 'paint') paints.addToBox(box.id, option.id)
  else paints.addColourToBox(box.id, option.colour)
  boxesChanged()
}

function removeFromBox(boxId, paintId) {
  paints.removeFromBox(boxId, paintId)
  boxesChanged()
}

// The box as a JSON file, to keep as a backup or to take to another browser.
function exportBox(box) {
  const data = paints.exportBox(box.id)
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${data.name.replace(/[\\/:*?"<>|]+/g, '-') || 'paintbox'}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onImportClick(event) {
  importError.value = ''
  if (!mayAddBox()) event.preventDefault()
}

async function importBox(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    paints.importBox(JSON.parse(await file.text()))
    boxesChanged()
  } catch (e) {
    importError.value = e instanceof SyntaxError ? t('This is not a paint box file.') : t(e.message)
  }
}

function startPaint(paint, at) {
  formAt.value = at
  paintForm.value = paint
    ? { id: paint.id, vendor: paint.vendor, number: paint.number, name: paint.name, form: paint.forms[0], hex: paint.hex }
    : { id: null, vendor: HOUSE_VENDOR, number: '', name: '', form: at === 'tube' ? 'tube' : 'pan', hex: '#c88c5f' }
}

// The series already in use and those that come with the app.
const series = computed(() => seriesNames(paints.all, PAINT_LIBRARIES))
// The library the series belongs to: its numbers fill in name and colour.
const library = computed(() => libraryByName(paintForm.value?.vendor))

function savePaint() {
  paints.savePaint(paintForm.value, formAt.value === 'own' ? null : formAt.value)
  paintForm.value = null
  formAt.value = null
  boxesChanged()
}

function deletePaint(id) {
  if (confirming.value !== id) {
    confirming.value = id
    return
  }
  paints.deletePaint(id)
  confirming.value = null
  dirty.value = true
}
</script>
