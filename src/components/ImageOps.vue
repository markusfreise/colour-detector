<template>
  <!-- What is done with the picture as a whole: a new one, saving, the collection, printing. -->
  <nav class="imageops" aria-label="Picture">
    <label class="button button--secondary imageops__button" title="New: choose a photo">
      <AppIcon name="new" />
      <input class="imageops__file" type="file" accept="image/*" aria-label="New: choose a photo" @change="onFile" />
    </label>
    <label v-if="hasCamera" class="button button--secondary imageops__button">
      Take photo
      <input class="imageops__file" type="file" accept="image/*" capture="environment" @change="onFile" />
    </label>
    <button class="button button--ghost imageops__button" type="button" title="Samples: choose a sample picture" @click="emit('show-samples')">
      <AppIcon name="sample" label="Samples" />
    </button>
    <button class="button button--ghost imageops__button" type="button" :disabled="!analysis.image" title="Save" @click="collection.saveCurrent()">
      <AppIcon name="save" label="Save" />
    </button>
    <button class="button button--ghost imageops__button" type="button" title="Collection" @click="emit('show-collection')">
      <AppIcon name="collection" label="Collection" />
    </button>
    <button class="button button--ghost imageops__button" type="button" :disabled="!printable" title="Print / PDF" @click="print">
      <AppIcon name="pdf" label="Print / PDF" />
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

const emit = defineEmits(['show-collection', 'show-samples'])
const analysis = useAnalysisStore()
const collection = useCollectionStore()
const usePro = useProStore()
// "Take photo" opens the camera directly; that only exists on phones and tablets.
const hasCamera = window.matchMedia?.('(pointer: coarse)').matches ?? false

// Something to print: colours in mix mode, a plan of layers in layer mode.
const printable = computed(() => (analysis.layerMode ? !!analysis.layers : analysis.entries.length > 0))

// The print stylesheet lays out the sheet; the browser's dialog offers "Save as PDF".
async function print() {
  // window.print() does nothing inside the app's web view; the shell prints it instead.
  if (isNative) return sendNative('print')
  // A free account in the browser does not print.
  if (!usePro.require(false, 'print or save a PDF')) return
  // The sheets of layer mode are built on `beforeprint`, but the page only renders them a tick
  // later, which is too late for the print snapshot. So build them first, then print.
  window.dispatchEvent(new Event('beforeprint'))
  await nextTick()
  window.print()
}

function onFile(event) {
  const file = event.target.files?.[0]
  if (file) analysis.loadFile(file)
  event.target.value = ''
}
</script>
