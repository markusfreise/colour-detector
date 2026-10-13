<template>
  <!-- With accounts on, the app opens after signing in and agreeing to the two statements. -->
  <AccountGate v-if="!account.ready" />
  <div v-else class="app" :class="{ 'app--layer': analysis.layerMode }">
    <p v-if="account.notice" class="app__notice">
      {{ account.notice.text }}
      <button class="app__footer-link" type="button" @click="account.notice = null">Hide</button>
    </p>
    <main class="app__main">
      <!-- The picture is the background of the window; everything else lies over it. -->
      <div class="app__stage">
        <PaintingCanvas ref="painting" />
      </div>
      <div class="app__left">
        <ImageOps @show-collection="collectionDialog.open()" @show-samples="sampleDialog.open()" @export-picture="painting.exportJpg()" />
        <button v-if="account.enabled" class="button button--ghost" type="button" @click="account.open = true">Account</button>
      </div>
      <div class="app__top">
        <LayerSteps />
        <CloseupBar />
      </div>
      <div class="app__bottom">
        <CloseupStrip />
        <LayerStrip />
      </div>
      <!-- Over the picture, moved up and down by hand: the colour that was tapped. -->
      <ColourInspector v-if="!analysis.layerMode" @breakdown="breakdown.open()" />
      <aside class="app__sidebar">
        <ControlsPanel />
        <template v-if="analysis.layerMode">
          <LayerArea />
          <LayerList @show-paintbox="paintBox.open()" />
        </template>
        <template v-else>
          <PaletteList @show-paintbox="paintBox.open()" />
        </template>
      </aside>
    </main>
    <LayerSheets v-if="analysis.layerMode" />
    <PrintLegend v-else />
    <footer v-if="!isNative" class="app__footer">
      <a class="app__footer-link" href="manual/">Manual</a>
      <a class="app__footer-link" href="privacy/">Privacy</a>
      <a class="app__footer-link" href="terms/">Terms</a>
      <a class="app__footer-link" href="imprint/">Imprint</a>
      <button v-if="consent.available" class="app__footer-link" type="button" @click="consent.review()">Privacy settings</button>
    </footer>
    <ColourBreakdown ref="breakdown" />
    <PaintBox ref="paintBox" />
    <CollectionDialog ref="collectionDialog" />
    <SampleDialog ref="sampleDialog" />
    <ProDialog />
    <AccountDialog v-if="account.enabled" />
    <ConsentBanner />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useAnalysisStore } from './stores/analysis.js'
import PaintingCanvas from './components/PaintingCanvas.vue'
import CloseupBar from './components/CloseupBar.vue'
import CloseupStrip from './components/CloseupStrip.vue'
import ControlsPanel from './components/ControlsPanel.vue'
import ImageOps from './components/ImageOps.vue'
import ColourInspector from './components/ColourInspector.vue'
import ColourBreakdown from './components/ColourBreakdown.vue'
import PaletteList from './components/PaletteList.vue'
import LayerList from './components/LayerList.vue'
import LayerSteps from './components/LayerSteps.vue'
import LayerStrip from './components/LayerStrip.vue'
import LayerArea from './components/LayerArea.vue'
import LayerSheets from './components/LayerSheets.vue'
import PaintBox from './components/PaintBox.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import PrintLegend from './components/PrintLegend.vue'
import CollectionDialog from './components/CollectionDialog.vue'
import SampleDialog from './components/SampleDialog.vue'
import ProDialog from './components/ProDialog.vue'
import AccountGate from './components/AccountGate.vue'
import AccountDialog from './components/AccountDialog.vue'
import { useConsentStore } from './stores/consent.js'
import { useAccountStore } from './stores/account.js'
import { isNative } from './lib/native.js'
import { useProStore } from './stores/pro.js'
import { useCollectionStore } from './stores/collection.js'

const analysis = useAnalysisStore()
const consent = useConsentStore()
const account = useAccountStore()
const paintBox = ref(null)
const painting = ref(null)
const breakdown = ref(null)
const collectionDialog = ref(null)
const sampleDialog = ref(null)
onMounted(() => {
  consent.init()
  account.init()
  useProStore().init()
  useCollectionStore().refresh()
  analysis.loadSample()
})
</script>
