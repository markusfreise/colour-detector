<template>
  <!-- The whole breakdown of the colour being looked at: target against mix, the colour by hand,
       and every recipe. With room beside it, it floats over the picture like the colours and is
       dragged by its handle; in a narrow window it fills the window. -->
  <dialog
    ref="panel"
    class="breakdown"
    :class="{ 'breakdown--floating': floating, 'flyout--dragging': dragging }"
    :style="floating ? style : null"
    aria-labelledby="breakdown-title"
    @click="onBackdrop"
    @keydown.esc="close"
  >
    <div class="breakdown__body">
      <header class="breakdown__header">
        <div v-if="floating" class="flyout__handle breakdown__handle" :title="t('Drag to move the colour')" @pointerdown="startDrag"></div>
        <h2 id="breakdown-title" class="panel__title">{{ t('Colour {label}', { label: entry?.label ?? '' }) }}</h2>
        <button class="button button--ghost breakdown__close" type="button" @click="close">{{ t('Close') }}</button>
      </header>
      <EntryEditor />
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useFloating } from './floating.js'
import EntryEditor from './EntryEditor.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const entry = computed(() => analysis.inspectedColour)

// Wider than NARROW (as in the stylesheet) it floats; below, it is a modal over the whole window.
const NARROW = 760
const floating = ref(false)
const { panel, style, dragging, startDrag, raise, keepInWindow } = useFloating('breakdown')

function open() {
  floating.value = window.innerWidth > NARROW
  if (panel.value.open) panel.value.close()
  if (floating.value) {
    panel.value.show()
    raise()
    requestAnimationFrame(keepInWindow)
  } else {
    panel.value.showModal()
  }
}
const close = () => panel.value?.close()

defineExpose({ open })

// A new analysis or another picture leaves no colour to break down.
watch(entry, (colour) => {
  if (!colour) close()
})

function onBackdrop(event) {
  if (!floating.value && event.target === panel.value) close()
}
</script>
