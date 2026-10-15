<template>
  <dialog ref="dialog" class="panel paintbox" aria-labelledby="paintbox-title" @click="onBackdrop" @close="onClose">
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
            {{ t(box.name) }}
          </button>
        </div>
        <button class="button button--ghost" type="button" @click="startBox('new')">{{ t('New box') }}</button>
        <button class="button button--ghost" type="button" @click="startBox('rename')">{{ t('Rename') }}</button>
        <button v-if="paints.boxes.length > 1" class="button button--ghost" type="button" @click="deleteBox">
          {{ confirming === 'box' ? t('Really delete?') : t('Delete box') }}
        </button>
      </div>
      <form v-if="boxMode" class="paintbox__edit" @submit.prevent="saveBox">
        <input v-model="boxName" class="input" type="text" maxlength="40" :placeholder="t('Name of the box')" :aria-label="t('Name of the box')" />
        <button class="button" type="submit">{{ boxMode === 'new' ? t('Create box') : t('Save name') }}</button>
        <button class="button button--ghost" type="button" @click="boxMode = null">{{ t('Cancel') }}</button>
      </form>

      <p v-if="layerMode" class="paintbox__note">
        {{
          t('Layer mode paints with a few base paints, one layer each ({n} of {max}). They are kept apart from the paints selected for mixing.', {
            n: selected.length,
            max: MAX_LAYER_PAINTS,
          })
        }}
        <template v-if="full">{{ t(' {max} layers at most: remove one before adding another.', { max: MAX_LAYER_PAINTS }) }}</template>
      </p>
      <div class="paintbox__group paintbox__group--selected" :aria-label="layerMode ? t('Base paints') : t('Selected paints')">
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
      </div>

      <div v-for="group in available" :key="group.key" class="paintbox__group">
        <div class="paintbox__group-header">
          <h3 class="paintbox__group-title">{{ t(group.name) }}</h3>
          <label class="checkbox" :title="t('Let Auto choose from {group}', { group: t(group.name) })">
            <input type="checkbox" :checked="!autoOff.has(group.key)" @change="setAutoGroup(group.key, $event.target.checked)" />
            {{ t('Use for Auto') }}
          </label>
        </div>
        <ul v-if="group.paints.length" class="paintbox__list">
          <li v-for="p in group.paints" :key="p.id">
            <PaintChip :paint="p" :disabled="full" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
        <p v-else class="paintbox__empty">{{ t('All of these are selected.') }}</p>
      </div>

      <div class="paintbox__group">
        <div class="paintbox__own-header">
          <h3 class="paintbox__group-title">{{ t('Your own paints') }}</h3>
          <button v-if="!paintForm" class="button button--secondary" type="button" @click="startPaint()">{{ t('Add paint') }}</button>
        </div>
        <form v-if="paintForm" class="paintbox__paint-form" @submit.prevent="savePaint">
          <!-- A paint from one of the libraries that come with the app: first the library, then the
               colour out of it, and the whole form is filled in. The libraries are Pro. -->
          <p v-if="!pro.active" class="paintbox__note paintbox__input--wide">
            <button class="paintbox__get-pro" type="button" @click="pro.require(false, 'add colours from the catalogues of known manufacturers')">
              {{ t('Get pro') }}
            </button>
            {{ t('and easily add pre-defined colours from the catalogues of known manufacturers and brands.') }}
          </p>
          <label v-else class="paintbox__input paintbox__input--wide">
            <span>{{ t('Library') }}</span>
            <select v-model="libraryPick" class="input input--select">
              <option value="">{{ t('Add new below') }}</option>
              <option v-for="preset in PAINT_LIBRARIES" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
            </select>
          </label>
          <label v-if="picked" class="paintbox__input paintbox__input--wide">
            <span>{{ t('Colour from {library}', { library: picked.name }) }}</span>
            <select v-model="colourPick" class="input input--select" @change="useColour">
              <option value="">{{ t('Choose a colour') }}</option>
              <option v-for="colour in picked.catalogue" :key="colour.number" :value="colour.number">
                {{ paintNumber(colour.number) }} {{ colour.name }}
              </option>
            </select>
          </label>
          <label class="paintbox__input paintbox__input--wide">
            <span>{{ t('Vendor and Series') }}</span>
            <select v-model="seriesPick" class="input input--select">
              <option v-for="name in series" :key="name" :value="name">{{ name }}</option>
              <option value="new">{{ t('New series') }}</option>
            </select>
          </label>
          <label v-if="seriesPick === 'new'" class="paintbox__input paintbox__input--wide">
            <span>{{ t('Name of the series') }}</span>
            <input v-model="paintForm.vendor" class="input" type="text" maxlength="60" required @change="lookUp" />
            <span class="paintbox__hint">{{ t('New series will be created') }}</span>
          </label>
          <label class="paintbox__input">
            <span>{{ t('Number') }}</span>
            <input v-model="paintForm.number" class="input" type="text" maxlength="8" required @change="lookUp" />
          </label>
          <label class="paintbox__input">
            <span>{{ t('Form') }}</span>
            <select v-model="paintForm.form" class="input input--select">
              <option value="pan">{{ t('Pan') }}</option>
              <option value="tube">{{ t('Tube') }}</option>
            </select>
          </label>
          <label class="paintbox__input paintbox__input--wide">
            <span>{{ t('Name') }}</span>
            <input v-model="paintForm.name" class="input" type="text" maxlength="60" required />
          </label>
          <label class="paintbox__input paintbox__input--wide">
            <span>{{ t('Colour') }}</span>
            <input v-model="paintForm.hex" class="input input--colour" type="color" />
          </label>
          <p class="paintbox__note">
            {{ t('Pick the colour of a medium wash on white paper, not the colour straight from the pan or tube.') }}
            <template v-if="library && pro.active">{{ t('{library} numbers fill in name and colour.', { library: library.name }) }}</template>
          </p>
          <div class="paintbox__form-actions">
            <button class="button button--secondary" type="submit">{{ paintForm.id ? t('Save paint') : t('Add paint') }}</button>
            <button class="button button--ghost" type="button" @click="paintForm = null">{{ t('Cancel') }}</button>
          </div>
        </form>
        <ul v-if="paints.custom.length" class="paintbox__own">
          <!-- One paint per row: the colour itself carries what is done with it. -->
          <li v-for="p in paints.custom" :key="p.id" class="chip chip--row paintbox__own-chip" :style="chipStyle(p.hex)">
            <span class="paintbox__own-lines">
              <span class="chip__text"><span class="chip__strong">{{ paintNumber(p.number) }}</span> {{ paintName(p) }}</span>
              <span class="chip__text paintbox__own-vendor">{{ p.vendor }} · {{ paintForms(p) === 'P' ? t('Pan') : t('Tube') }}</span>
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
        <p v-else-if="!paintForm" class="paintbox__empty">{{ t('Add paints of any brand that are not in the list above.') }}</p>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePaintsStore, MAX_LAYER_PAINTS } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { useProStore, FREE_BOXES, FREE_PAINTS } from '../stores/pro.js'
import { chipStyle } from '../lib/color.js'
import { paintNumber, paintForms, groupPaints, sortPaints, seriesNames, HOUSE_VENDOR } from '../lib/paintbox.js'
import { PAINT_LIBRARIES, libraryByName } from '../data/libraries.js'
import PaintChip from './PaintChip.vue'
import AppIcon from './AppIcon.vue'
import { useText } from '../i18n/index.js'

const { t, paintName } = useText()
const paints = usePaintsStore()
const analysis = useAnalysisStore()
const pro = useProStore()
const dirty = ref(false)
const dialog = ref(null)
const boxMode = ref(null) // 'new' | 'rename' | null
const boxName = ref('')
const paintForm = ref(null) // the paint being added or edited
const libraryPick = ref('') // the library dropdown, back on "Add new below" once a colour is taken
const colourPick = ref('') // the colour dropdown of that library
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
    if (on && !pro.require(paints.enabledIds.size < pro.paintLimit, `mix from more than ${FREE_PAINTS} paints`)) return
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
  libraryPick.value = ''
  colourPick.value = ''
  paintForm.value = paint
    ? { id: paint.id, vendor: paint.vendor, number: paint.number, name: paint.name, form: paint.forms[0], hex: paint.hex }
    : { id: null, vendor: HOUSE_VENDOR, number: '', name: '', form: 'pan', hex: '#c88c5f' }
}

// The series already in use and those that come with the app.
const series = computed(() => seriesNames(paints.all, PAINT_LIBRARIES))
// The library the series belongs to: its numbers fill in name and colour.
const library = computed(() => libraryByName(paintForm.value?.vendor))
// The library whose colours are on offer, once one is chosen.
const picked = computed(() => PAINT_LIBRARIES.find((preset) => preset.id === libraryPick.value) ?? null)
// The series as a dropdown; "new" opens a field for a series of one's own.
const seriesPick = computed({
  get: () => (series.value.includes(paintForm.value?.vendor) ? paintForm.value.vendor : 'new'),
  set: (name) => {
    paintForm.value.vendor = name === 'new' ? '' : name
  },
})

// A colour taken from the library fills the whole form in; both dropdowns go back to their default.
function useColour() {
  const colour = picked.value?.catalogue.find((c) => c.number === colourPick.value)
  if (colour) Object.assign(paintForm.value, { vendor: picked.value.name, number: colour.number, name: colour.name, hex: colour.hex })
  colourPick.value = ''
  libraryPick.value = ''
}

// A number that is on the colour chart of its library fills in the rest.
function lookUp() {
  const form = paintForm.value
  if (!form || form.id || form.name || !pro.active) return
  const known = library.value?.catalogue.find((c) => c.number === form.number.trim())
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
