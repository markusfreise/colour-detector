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
        <div class="paintbox__group-header">
          <h3 class="paintbox__group-title">{{ layerMode ? t('Base paints') : t('Palette') }}</h3>
          <p v-if="!layerMode && !paints.starter" class="paintbox__note">{{ t('The palette is saved with the picture.') }}</p>
        </div>
        <ul v-if="selected.length" class="paintbox__list">
          <li v-for="p in selected" :key="p.id">
            <PaintChip :paint="p" enabled show-form :used="!layerMode && analysis.usedPaintIds.has(p.id)" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">
          {{ layerMode ? t('No base paints chosen. Click a paint below to add it, or press Auto.') : t('No paints selected. Click a paint below to add it.') }}
        </p>
      </div>

      <!-- The free version: the twelve colours of the Starter box, and nothing to change about them. -->
      <section v-if="paints.starter" class="paintbox__group" :aria-label="t(STARTER_BOX_NAME)">
        <h3 class="paintbox__group-title">{{ t(STARTER_BOX_NAME) }}</h3>
        <ul v-if="starterList.length" class="paintbox__list">
          <li v-for="p in starterList" :key="p.id">
            <PaintChip :paint="p" :disabled="full" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">{{ t('All of these are selected.') }}</p>
        <p class="paintbox__note">
          {{ t('The free version mixes from the twelve colours of a student set.') }}
          <button class="paintbox__get-pro" type="button" @click="askOwnPaints">{{ t('Mix with your own paints') }}</button>
        </p>
      </section>

      <div v-if="!paints.starter" class="paintbox__boxes">
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
              type="button"
              :title="t('Add a colour to {box}', { box: t(box.name) })"
              :aria-label="t('Add a colour to {box}', { box: t(box.name) })"
              @click="addColour.open(box)"
            >
              <span aria-hidden="true">+</span>
            </button>
          </li>
        </ul>
        <p v-if="size && !list.length" class="paintbox__empty">{{ t('All of these are selected.') }}</p>

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
      <div v-if="paints.custom.length && !paints.starter" class="paintbox__group">
        <h3 class="paintbox__group-title">{{ t('Your own paints') }}</h3>
        <PaintForm v-if="paintForm" v-model="paintForm" :series="series" :library="library" :pro="libraryOpen(library, pro.can('brand_charts'))" @submit="savePaint" @cancel="paintForm = null" />
        <ul class="paintbox__own">
          <!-- One paint per row: the colour itself carries what is done with it. -->
          <li v-for="p in paints.custom" :key="p.id" class="chip chip--row paintbox__own-chip" :style="chipStyle(p.hex)">
            <span class="paintbox__own-lines">
              <span class="chip__text"><span class="chip__strong">{{ paintNumber(p.number) }}</span> {{ paintName(p) }}</span>
              <span class="chip__text paintbox__own-vendor">{{ t(p.vendor) }} · {{ t(formName(p)) }}</span>
            </span>
            <span class="paintbox__own-actions">
              <button class="paintbox__own-action" type="button" :title="t('Edit this paint')" @click="startPaint(p)">
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
    <AddColour ref="addColour" @changed="boxesChanged" @pro="openPro" />
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useProStore } from '../stores/pro.js'
import { STARTER_BOX_NAME } from '../data/starter.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber, sortPaints, sortBoxPaints, seriesNames, ownForm, formName } from '../lib/paintbox.js'
import { PAINT_LIBRARIES, libraryByName, libraryOpen } from '../data/libraries.js'
import { useChartsStore } from '../stores/charts.js'
import { isNative } from '../lib/native.js'
import PaintChip from './PaintChip.vue'
import PaintForm from './PaintForm.vue'
import AddColour from './AddColour.vue'
import AppIcon from './AppIcon.vue'
import { useText } from '../i18n/index.js'

const { t, paintName } = useText()
const paints = usePaintsStore()
const analysis = useAnalysisStore()
const pro = useProStore()
const charts = useChartsStore()
// The colour charts come with Pro, from the account API.
// The common colours for everybody; with a plan the makers' charts come too.
watch(() => pro.can('brand_charts'), (may, before) => charts.load(before !== undefined && may !== before), { immediate: true })
const dirty = ref(false)
const dialog = ref(null)
const newBox = ref(false) // the name field of a new box is open
const newBoxField = ref(null)
const boxName = ref('') // the name being entered, for a new box or a renamed one
const renaming = ref(null) // id of the box being renamed
const removing = ref(null) // id of the box whose colours are being taken out
const addColour = ref(null) // the dialog that adds colours to a box
const paintForm = ref(null) // one's own paint being edited
const confirming = ref(null) // 'box:<id>' or a paint id: the delete button was clicked once
const importError = ref('')

// In layer mode the dialog edits the base paints of the palette instead of its selection for mixing.
const layerMode = computed(() => analysis.layerMode)
const autoOn = computed(() => (layerMode.value ? paints.palette.layerAuto : paints.palette.auto))
const selected = computed(() => (layerMode.value ? sortPaints(paints.layerPaints) : paints.selected))
const autoOff = computed(() => new Set(paints.palette.autoOff))
const full = computed(() => layerMode.value && paints.palette.layerIds.length >= MAX_LAYER_PAINTS)

// The Starter box: its colours that are not in the palette.
const starterList = computed(() => {
  const inPalette = layerMode.value ? new Set(paints.palette.layerIds) : paints.enabledIds
  return sortPaints(paints.all.filter((p) => !inPalette.has(p.id)))
})

// Every box with the paints that are not in the palette; those are at the top already.
const boxLists = computed(() => {
  if (paints.starter) return []
  const inPalette = layerMode.value ? new Set(paints.palette.layerIds) : paints.enabledIds
  return paints.boxes.map((box) => {
    const own = box.paintIds.map((id) => paints.byId[id]).filter(Boolean)
    // While colours are being taken out, all of them, those in the palette too.
    const list = removing.value === box.id ? own : own.filter((p) => !inPalette.has(p.id))
    return { box, size: own.length, list: sortBoxPaints(box, list) }
  })
})

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
let proposing = null
function auto() {
  if (layerMode.value) {
    // The proposal needs the picture, so it is made while the layers are planned again.
    analysis.proposeLayers()
    dirty.value = false
    return
  }
  proposing = analysis.autoPaints(true)
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

async function apply() {
  dirty.value = false
  // A proposal still on its way comes first, so the mixes are made with its paints.
  await proposing
  analysis.recomputeAllRecipes()
}

// With Auto on, what the boxes hold is what it chooses from.
function boxesChanged() {
  if (autoOn.value) dirty.value = true
}

// The purchase dialog is a modal of its own; this one would cover it.
function openPro(feature, reason) {
  if (pro.require(feature, reason)) return true
  addColour.value?.close()
  dialog.value.close()
  return false
}

// Boxes of one's own are part of the full version.
const mayAddBox = () => openPro('paint_boxes', 'add paint boxes of your own')

// One's own paints take a credit on this picture, or a plan.
const askOwnPaints = () => openPro('own_paints', 'mix with your own paints')

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

function toggleRemoving(id) {
  removing.value = removing.value === id ? null : id
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
  if (!openPro('box_import', 'import a paint box')) event.preventDefault()
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

function startPaint(paint) {
  paintForm.value = { id: paint.id, vendor: paint.vendor, number: paint.number, name: paint.name, form: ownForm(paint.forms[0]), hex: paint.hex }
}

// The series already in use and those that come with the app.
const series = computed(() => seriesNames(paints.all, PAINT_LIBRARIES))
// The library the series belongs to: its numbers fill in name and colour.
const library = computed(() => {
  const found = libraryByName(paintForm.value?.vendor)
  return found && { ...found, catalogue: charts.of(found.id) }
})

function savePaint() {
  paints.savePaint(paintForm.value)
  paintForm.value = null
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
