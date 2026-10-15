<template>
  <!-- With accounts on, the app opens after signing in and agreeing to the two statements. -->
  <AccountGate v-if="!account.ready" />
  <div v-else class="app" :class="{ 'app--layer': analysis.layerMode }">
    <p v-if="account.notice" class="app__notice">
      {{ account.notice.text }}
      <button class="app__footer-link" type="button" @click="account.notice = null">{{ t('Hide') }}</button>
    </p>
    <main class="app__main">
      <!-- The picture is the background of the window; everything else lies over it. -->
      <div class="app__stage">
        <PaintingCanvas ref="painting" @show-samples="sampleDialog.open()" />
      </div>
      <div class="app__left">
        <ImageOps @show-collection="collectionDialog.open()" @show-samples="sampleDialog.open()" @export-picture="painting.exportJpg()" />
        <!-- The account, and the preferences (language, light or dark) with or without one. -->
        <button class="button button--ghost" type="button" :data-hint="account.enabled ? t('Account') : t('Preferences')" @click="account.open = true">
          <AppIcon name="user" :label="account.enabled ? t('Account') : t('Preferences')" />
        </button>
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
      <a class="app__footer-link" :href="legalPage('manual')">{{ t('Manual') }}</a>
      <a class="app__footer-link" :href="legalPage('privacy')">{{ t('Privacy') }}</a>
      <a class="app__footer-link" :href="legalPage('terms')">{{ t('Terms') }}</a>
      <a class="app__footer-link" :href="legalPage('imprint')">{{ t('Imprint') }}</a>
      <button v-if="consent.available" class="app__footer-link" type="button" @click="consent.review()">{{ t('Privacy settings') }}</button>
    </footer>
    <ColourBreakdown ref="breakdown" />
    <PaintBox ref="paintBox" />
    <CollectionDialog ref="collectionDialog" />
    <SampleDialog ref="sampleDialog" />
    <ProDialog />
    <AccountDialog />
    <ConsentBanner />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
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
import AppIcon from './components/AppIcon.vue'
import AccountGate from './components/AccountGate.vue'
import AccountDialog from './components/AccountDialog.vue'
import { useConsentStore } from './stores/consent.js'
import { useAccountStore } from './stores/account.js'
import { isNative } from './lib/native.js'
import { useProStore } from './stores/pro.js'
import { useCollectionStore } from './stores/collection.js'
import { useText } from './i18n/index.js'

const { t, legalPage } = useText()
const analysis = useAnalysisStore()
const consent = useConsentStore()
const account = useAccountStore()
const paintBox = ref(null)
const painting = ref(null)
const breakdown = ref(null)
const collectionDialog = ref(null)
const sampleDialog = ref(null)
// Right after signing in (and agreeing, the first time) the plans come up once, unless they are paid for.
const pro = useProStore()
watch(
  () => account.ready && account.welcome && account.loaded,
  (show) => {
    if (!show) return
    account.welcome = false
    if (!pro.active && account.plans.length) pro.require(false, 'use everything')
  },
  { flush: 'post' },
)
onMounted(() => {
  consent.init()
  account.init()
  useProStore().init()
  useCollectionStore().refresh()
})
// Once the app is open it shows the picture used last, or nothing and the welcome to load one
// (PaintingCanvas.vue). Behind the gate the showcase has the picture (AccountGate.vue), and it is
// gone by the time this runs.
const collection = useCollectionStore()
watch(
  () => account.ready,
  (ready) => {
    if (ready && !analysis.image) collection.openLast()
  },
  { immediate: true, flush: 'post' },
)
// The picture used last is kept when another one is opened, and with its settings and colour
// changes whenever the page goes out of sight.
watch(
  () => analysis.image,
  (image) => {
    if (image && account.ready) collection.rememberCurrent()
  },
)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && account.ready) collection.rememberCurrent()
})
</script>
