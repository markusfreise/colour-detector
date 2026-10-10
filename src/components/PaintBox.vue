<template>
  <dialog ref="dialog" class="panel paintbox" aria-labelledby="paintbox-title" @click="onBackdrop" @close="onClose">
    <div class="paintbox__body">
      <header class="paintbox__header">
        <h2 id="paintbox-title" class="panel__title">
          Paint box <small class="panel__count">{{ paints.enabledIds.size }}/{{ paints.all.length }}</small>
        </h2>
        <div class="paintbox__actions">
          <button class="button button--ghost" type="button" @click="reset">Reset</button>
          <button class="button button--secondary" type="button" :disabled="!dirty" @click="apply">
            Update mixes
          </button>
          <button class="button button--ghost" type="button" @click="close">Close</button>
        </div>
      </header>

      <div class="paintbox__group paintbox__group--selected" aria-label="Selected paints">
        <template v-if="paints.selected.length">
          <ul class="paintbox__list">
            <li v-for="p in paints.selected" :key="p.id">
              <PaintChip :paint="p" enabled :used="analysis.usedPaintIds.has(p.id)" @toggle="toggle(p.id, $event)" />
            </li>
          </ul>
          <button class="button button--ghost paintbox__clear" type="button" @click="clear">Clear</button>
        </template>
        <p v-else class="paintbox__empty">No paints selected. Click a paint below to add it.</p>
      </div>

      <div v-for="group in paints.available" :key="group.key" class="paintbox__group" :aria-label="`Available ${group.name.toLowerCase()}`">
        <ul v-for="family in group.families" :key="family.key" class="paintbox__list">
          <li v-for="p in family.paints" :key="p.id">
            <PaintChip :paint="p" @toggle="toggle(p.id, $event)" />
          </li>
        </ul>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'
import { usePaintsStore } from '../stores/paints.js'
import { useAnalysisStore } from '../stores/analysis.js'
import PaintChip from './PaintChip.vue'

const paints = usePaintsStore()
const analysis = useAnalysisStore()
const dirty = ref(false)
const dialog = ref(null)

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
}

function toggle(id, on) {
  paints.toggle(id, on)
  dirty.value = true
}

function clear() {
  paints.setAll(paints.all.map((p) => p.id), false)
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
</script>
