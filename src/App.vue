<template>
  <div class="app" :class="{ 'app--layer': analysis.layerMode }">
    <header class="app__header">
      <h1 class="app__title">{{ APP_NAME }}</h1>
      <p class="app__tagline">Find the main colours in a photo and mix them from your watercolours.</p>
    </header>
    <main class="app__main">
      <div class="app__stage">
        <PaintingCanvas />
        <LayerSteps />
        <p class="app__hint">{{ hint }}</p>
      </div>
      <aside class="app__sidebar">
        <ControlsPanel @show-collection="collectionDialog.open()" />
        <template v-if="analysis.layerMode">
          <LayerArea />
          <LayerList @show-paintbox="paintBox.open()" />
        </template>
        <template v-else>
          <EntryEditor />
          <PaletteList @show-paintbox="paintBox.open()" />
        </template>
      </aside>
    </main>
    <LayerSheets v-if="analysis.layerMode" />
    <PrintLegend v-else />
    <footer v-if="consent.available" class="app__footer">
      <button class="app__footer-link" type="button" @click="consent.review()">Privacy settings</button>
    </footer>
    <PaintBox ref="paintBox" />
    <CollectionDialog ref="collectionDialog" />
    <ProDialog />
    <ConsentBanner />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAnalysisStore } from './stores/analysis.js'
import PaintingCanvas from './components/PaintingCanvas.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import EntryEditor from './components/EntryEditor.vue'
import PaletteList from './components/PaletteList.vue'
import LayerList from './components/LayerList.vue'
import LayerSteps from './components/LayerSteps.vue'
import LayerArea from './components/LayerArea.vue'
import LayerSheets from './components/LayerSheets.vue'
import PaintBox from './components/PaintBox.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import PrintLegend from './components/PrintLegend.vue'
import CollectionDialog from './components/CollectionDialog.vue'
import ProDialog from './components/ProDialog.vue'
import { useConsentStore } from './stores/consent.js'
import { useProStore } from './stores/pro.js'
import { useCollectionStore } from './stores/collection.js'
import { APP_NAME } from './config.js'

const analysis = useAnalysisStore()
const consent = useConsentStore()
const paintBox = ref(null)
const collectionDialog = ref(null)
const hint = computed(() => {
  if (!analysis.layerMode) return 'Click an area to see its recipe and change its colour.'
  if (analysis.settings.numbers && analysis.layerStep == null && analysis.layerSolo == null && analysis.layers) {
    return 'Numbers show the coats of one layer. Click a layer in the list to see them. Click the picture to see what a spot gets.'
  }
  return 'Click the picture to see which layers a spot gets.'
})
onMounted(() => {
  consent.init()
  useProStore().init()
  useCollectionStore().refresh()
  analysis.loadSample(true)
})
</script>
