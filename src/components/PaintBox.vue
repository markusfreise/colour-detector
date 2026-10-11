<template>
  <dialog ref="dialog" class="panel paintbox" aria-labelledby="paintbox-title" @click="onBackdrop" @close="onClose">
    <div class="paintbox__body">
      <header class="paintbox__header">
        <h2 id="paintbox-title" class="panel__title">{{ layerMode ? 'Paint box: base paints' : 'Paint box' }}</h2>
        <div class="paintbox__actions">
          <button
            class="button"
            :class="autoOn ? 'button--secondary' : 'button--ghost'"
            type="button"
            :aria-pressed="autoOn"
            :title="layerMode ? 'Let the app choose the base paints for this picture' : 'Let the app select the paints that suit each picture'"
            :disabled="!analysis.pixels"
            @click="auto"
          >
            Auto
          </button>
          <button v-if="!layerMode" class="button button--ghost" type="button" @click="reset">Revert</button>
          <button class="button button--ghost" type="button" @click="clear">Clear</button>
          <button class="button button--secondary" type="button" :disabled="!dirty" @click="apply">
            {{ layerMode ? 'Update layers' : 'Update mixes' }}
          </button>
          <button class="button button--ghost" type="button" @click="close">Close</button>
        </div>
      </header>

      <div class="paintbox__boxes">
        <div class="segmented paintbox__box-list">
          <button
            v-for="box in paints.boxes"
            :key="box.id"
            type="button"
            class="segmented__option"
            :class="{ 'segmented__option--active': box.id === paints.activeBox.id }"
            @click="selectBox(box.id)"
          >
            {{ box.name }}
          </button>
        </div>
        <button class="button button--ghost" type="button" @click="startBox('new')">New box</button>
        <button class="button button--ghost" type="button" @click="startBox('rename')">Rename</button>
        <button v-if="paints.boxes.length > 1" class="button button--ghost" type="button" @click="deleteBox">
          {{ confirming === 'box' ? 'Really delete?' : 'Delete box' }}
        </button>
      </div>
      <form v-if="boxMode" class="paintbox__edit" @submit.prevent="saveBox">
        <input v-model="boxName" class="input" type="text" maxlength="40" placeholder="Name of the box" aria-label="Name of the box" />
        <button class="button" type="submit">{{ boxMode === 'new' ? 'Create box' : 'Save name' }}</button>
        <button class="button button--ghost" type="button" @click="boxMode = null">Cancel</button>
      </form>

      <p v-if="layerMode" class="paintbox__note">
        Layer mode paints with a few base paints, one layer each ({{ selected.length }} of {{ MAX_LAYER_PAINTS }}). They are
        kept apart from the paints selected for mixing.
        <template v-if="full"> {{ MAX_LAYER_PAINTS }} layers at most: remove one before adding another.</template>
      </p>
      <div class="paintbox__group paintbox__group--selected" :aria-label="layerMode ? 'Base paints' : 'Selected paints'">
        <ul v-if="selected.length" class="paintbox__list">
          <li v-for="p in selected" :key="p.id">
            <PaintChip :paint="p" enabled show-form :used="!layerMode && analysis.usedPaintIds.has(p.id)" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">
          {{ layerMode ? 'No base paints chosen. Click a paint below to add it, or press Auto.' : 'No paints selected. Click a paint below to add it.' }}
        </p>
      </div>

      <div v-for="group in available" :key="group.key" class="paintbox__group">
        <div class="paintbox__group-header">
          <h3 class="paintbox__group-title">{{ group.name }}</h3>
          <label class="checkbox" :title="`Let Auto choose from ${group.name}`">
            <input type="checkbox" :checked="!autoOff.has(group.key)" @change="setAutoGroup(group.key, $event.target.checked)" />
            Use for Auto
          </label>
        </div>
        <ul v-if="group.paints.length" class="paintbox__list">
          <li v-for="p in group.paints" :key="p.id">
            <PaintChip :paint="p" :disabled="full" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">All of these are selected.</p>
      </div>

      <div class="paintbox__group">
        <div class="paintbox__own-header">
          <h3 class="paintbox__group-title">Your own paints</h3>
          <button v-if="!paintForm" class="button button--secondary" type="button" @click="startPaint()">Add paint</button>
        </div>
        <form v-if="paintForm" class="paintbox__paint-form" @submit.prevent="savePaint">
          <label class="paintbox__input">
            <span>Brand</span>
            <input v-model="paintForm.vendor" class="input" type="text" maxlength="40" required />
          </label>
          <label class="paintbox__input">
            <span>Number</span>
            <input v-model="paintForm.number" class="input" type="text" maxlength="8" required @change="lookUp" />
          </label>
          <label class="paintbox__input paintbox__input--wide">
            <span>Name</span>
            <input v-model="paintForm.name" class="input" type="text" maxlength="60" required />
          </label>
          <label class="paintbox__input">
            <span>Form</span>
            <select v-model="paintForm.form" class="input">
              <option value="pan">Pan</option>
              <option value="tube">Tube</option>
            </select>
          </label>
          <label class="paintbox__input">
            <span>Colour</span>
            <input v-model="paintForm.hex" class="input input--colour" type="color" />
          </label>
          <p class="paintbox__note">
            Pick the colour of a medium wash on white paper, not the colour straight from the pan or tube.
            Schmincke Horadam numbers fill in name and colour.
          </p>
          <div class="paintbox__form-actions">
            <button class="button" type="submit">{{ paintForm.id ? 'Save paint' : 'Add paint' }}</button>
            <button class="button button--ghost" type="button" @click="paintForm = null">Cancel</button>
          </div>
        </form>
        <ul v-if="paints.custom.length" class="paintbox__own">
          <li v-for="p in paints.custom" :key="p.id" class="paintbox__own-item">
            <span class="chip paintbox__own-chip" :style="chipStyle(p.hex)">
              <span class="chip__strong">{{ paintNumber(p.number) }}</span>
              <span class="chip__text">{{ p.name }}</span>
            </span>
            <span class="paintbox__own-vendor">{{ p.vendor }} · {{ paintForms(p) === 'P' ? 'Pan' : 'Tube' }}</span>
            <button class="button button--ghost" type="button" @click="startPaint(p)">Edit</button>
            <button class="button button--ghost" type="button" @click="deletePaint(p.id)">
              {{ confirming === p.id ? 'Really delete?' : 'Delete' }}
            </button>
          </li>
        </ul>
        <p v-else-if="!paintForm" class="paintbox__empty">Add paints of any brand that are not in the list above.</p>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useProStore, FREE_BOXES } from '../stores/pro.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber, paintForms, groupPaints, sortPaints } from '../lib/paintbox.js'
import { horadamCatalogue } from '../data/horadam-catalogue.js'
import PaintChip from './PaintChip.vue'

const paints = usePaintsStore()
const analysis = useAnalysisStore()
const pro = useProStore()
const dirty = ref(false)
const dialog = ref(null)
const boxMode = ref(null) // 'new' | 'rename' | null
const boxName = ref('')
const paintForm = ref(null) // the paint being added or edited
const confirming = ref(null) // 'box' or a paint id: the delete button was clicked once

// In layer mode the dialog edits the base paints of the box instead of its selection for mixing.
const layerMode = computed(() => analysis.layerMode)
const autoOn = computed(() => (layerMode.value ? paints.activeBox.layerAuto : paints.activeBox.auto))
const selected = computed(() => (layerMode.value ? sortPaints(paints.layerPaints) : paints.selected))
const available = computed(() => {
  if (!layerMode.value) return paints.available
  const base = new Set(paints.activeBox.layerIds)
  return groupPaints(paints.all, (p) => !base.has(p.id))
})
const autoOff = computed(() => new Set(paints.activeBox.autoOff))
const full = computed(() => layerMode.value && paints.activeBox.layerIds.length >= MAX_LAYER_PAINTS)

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

// A group joins or leaves the paints Auto chooses from; with Auto on, the choice is made again.
function setAutoGroup(key, on) {
  paints.setAutoGroup(key, on)
  if (autoOn.value && analysis.pixels) auto()
}

// Let the app pick the paints for the current picture, from the groups ticked for Auto.
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

function selectBox(id) {
  paints.selectBox(id)
  confirming.value = null
  dirty.value = true
}

function startBox(mode) {
  if (mode === 'new' && !pro.require(paints.boxes.length < FREE_BOXES, 'keep more than one paint box')) {
    // The purchase dialog is a modal of its own; this one would cover it.
    dialog.value.close()
    return
  }
  boxName.value = mode === 'rename' ? paints.activeBox.name : ''
  boxMode.value = mode
}

function saveBox() {
  if (boxMode.value === 'new') paints.addBox(boxName.value)
  else paints.renameBox(paints.activeBox.id, boxName.value)
  boxMode.value = null
  dirty.value = true
}

function deleteBox() {
  if (confirming.value !== 'box') {
    confirming.value = 'box'
    return
  }
  paints.deleteBox(paints.activeBox.id)
  confirming.value = null
  dirty.value = true
}

function startPaint(paint) {
  paintForm.value = paint
    ? { id: paint.id, vendor: paint.vendor, number: paint.number, name: paint.name, form: paint.forms[0], hex: paint.hex }
    : { id: null, vendor: 'Schmincke', number: '', name: '', form: 'pan', hex: '#c88c5f' }
}

// A Horadam number that is on the colour chart fills in the rest.
function lookUp() {
  const form = paintForm.value
  if (form.id || form.name || !/schmincke/i.test(form.vendor)) return
  const known = horadamCatalogue.find((c) => c.number === form.number.trim())
  if (known) Object.assign(form, { name: known.name, hex: known.hex })
}

function savePaint() {
  paints.savePaint(paintForm.value)
  paintForm.value = null
  dirty.value = true
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
