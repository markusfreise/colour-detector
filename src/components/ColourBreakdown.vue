<template>
  <!-- The whole breakdown of the colour being looked at, over the picture: target against mix,
       the colour by hand, and every recipe. It fills the window, on the phone as on the desk. -->
  <dialog ref="dialog" class="breakdown" aria-labelledby="breakdown-title" @click="onBackdrop">
    <div class="breakdown__body">
      <header class="breakdown__header">
        <h2 id="breakdown-title" class="panel__title">{{ t('Colour {label}', { label: entry?.label ?? '' }) }}</h2>
        <button class="button button--ghost breakdown__close" type="button" @click="dialog.close()">{{ t('Close') }}</button>
      </header>
      <EntryEditor />
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import EntryEditor from './EntryEditor.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const dialog = ref(null)
const entry = computed(() => analysis.inspectedColour)

defineExpose({ open: () => dialog.value.showModal() })

// A new analysis or another picture leaves no colour to break down.
watch(entry, (colour) => {
  if (!colour) dialog.value?.close()
})

function onBackdrop(event) {
  if (event.target === dialog.value) dialog.value.close()
}
</script>
