<template>
  <div class="app">
    <header class="app__header">
      <h1 class="app__title">Colour Detector</h1>
      <p class="app__tagline">Find the main colours in a photo and mix them from your watercolours.</p>
    </header>
    <main class="app__main">
      <div class="app__stage">
        <PaintingCanvas />
        <p class="app__hint">Click an area to see its recipe and change its colour.</p>
      </div>
      <aside class="app__sidebar">
        <ControlsPanel />
        <EntryEditor />
        <PaletteList @show-paintbox="paintBox.open()" />
      </aside>
    </main>
    <footer v-if="consent.available" class="app__footer">
      <button class="app__footer-link" type="button" @click="consent.review()">Privacy settings</button>
    </footer>
    <PaintBox ref="paintBox" />
    <ConsentBanner />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useAnalysisStore } from './stores/analysis.js'
import PaintingCanvas from './components/PaintingCanvas.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import EntryEditor from './components/EntryEditor.vue'
import PaletteList from './components/PaletteList.vue'
import PaintBox from './components/PaintBox.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import { useConsentStore } from './stores/consent.js'

const analysis = useAnalysisStore()
const consent = useConsentStore()
const paintBox = ref(null)
onMounted(() => {
  consent.init()
  analysis.loadSample()
})
</script>
