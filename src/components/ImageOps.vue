<template>
  <!-- What is done with the picture as a whole: a new one, saving, the collection, printing. -->
  <nav class="imageops" :aria-label="t('Picture')">
    <label class="button button--secondary imageops__button" data-tour="photo" :data-hint="t('New picture')">
      <AppIcon name="new" />
      <input class="imageops__file" type="file" accept="image/*,.wcl" :aria-label="t('New: choose a photo')" @change="onFile" />
    </label>
    <button class="button button--ghost imageops__button" type="button" data-tour="photo" :data-hint="t('Samples')" @click="emit('show-samples')">
      <AppIcon name="sample" :label="t('Samples')" />
    </button>
    <button class="button button--ghost imageops__button" type="button" :disabled="!analysis.image" :data-hint="t('Save')" @click="collection.saveCurrent()">
      <AppIcon name="save" :label="t('Save')" />
    </button>
    <button class="button button--ghost imageops__button" type="button" :data-hint="t('Collection')" @click="emit('show-collection')">
      <AppIcon name="collection" :label="t('Collection')" />
    </button>
    <button class="button button--ghost imageops__button" type="button" data-tour="print" :disabled="!printable" :data-hint="t('Print / PDF')" @click="print">
      <AppIcon name="pdf" :label="t('Print / PDF')" />
    </button>
    <!-- A download does not work inside the app's web view. -->
    <button v-if="!isNative" class="button button--ghost imageops__button" type="button" :disabled="!analysis.image || analysis.busy" :data-hint="t('Export as JPG')" @click="exportPicture">
      <AppIcon name="export" :label="t('Export as JPG')" />
    </button>
  </nav>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useCollectionStore } from '../stores/collection.js'
import { useProStore } from '../stores/pro.js'
import { isNative, sendNative } from '../lib/native.js'
import AppIcon from './AppIcon.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const emit = defineEmits(['show-collection', 'show-samples', 'export-picture'])
const analysis = useAnalysisStore()
const collection = useCollectionStore()
const usePro = useProStore()

// Something to print: colours in mix mode, a plan of layers in layer mode.
const printable = computed(() => (analysis.layerMode ? !!analysis.layers : analysis.entries.length > 0))

// The print stylesheet lays out the sheet; the browser's dialog offers "Save as PDF".
async function print() {
  // window.print() does nothing inside the app's web view; the shell prints it instead.
  if (isNative) return sendNative('print')
  // A free account in the browser does not print.
  if (!usePro.require('print', 'print or save a PDF')) return
  // The sheets of layer mode are built on `beforeprint`, but the page only renders them a tick
  // later, which is too late for the print snapshot. So build them first, then print.
  window.dispatchEvent(new Event('beforeprint'))
  await nextTick()
  window.print()
}

function exportPicture() {
  // A free account in the browser does not export, as it does not print.
  if (!usePro.require('export_jpg', 'export the picture')) return
  emit('export-picture')
}

function onFile(event) {
  const file = event.target.files?.[0]
  if (file) analysis.loadFile(file)
  event.target.value = ''
}
</script>
