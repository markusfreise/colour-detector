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
        <PaletteList />
        <PaintBox />
      </aside>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAnalysisStore } from './stores/analysis.js'
import PaintingCanvas from './components/PaintingCanvas.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import EntryEditor from './components/EntryEditor.vue'
import PaletteList from './components/PaletteList.vue'
import PaintBox from './components/PaintBox.vue'

const analysis = useAnalysisStore()
onMounted(() => analysis.loadSample())
</script>
