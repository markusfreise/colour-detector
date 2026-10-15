<template>
  <!-- With accounts on, the app opens after signing in and agreeing to the two statements. -->
  <AccountGate v-if="!account.ready" />
  <div v-else class="app" :class="{ 'app--layer': analysis.layerMode, 'app--hints': hints }">
    <p v-if="account.notice" class="app__notice">
      {{ account.notice.text }}
      <button class="app__footer-link" type="button" @click="account.notice = null">{{ t('Hide') }}</button>
    </p>
    <main class="app__main">
      <!-- The picture is the background of the window; everything else lies over it. -->
      <div class="app__stage">
        <PaintingCanvas ref="painting" @show-samples="sampleDialog.open()" />
      </div>
      <!-- On a phone the column is folded away behind a menu button; "Get pro" comes with it. -->
      <div class="app__left" :class="{ 'app__left--open': menuOpen }">
        <div class="app__menu">
          <button class="button button--ghost app__burger" type="button" :aria-expanded="menuOpen" :data-hint="t('Menu')" @click="menuOpen = !menuOpen">
            <AppIcon name="menu" :label="t('Menu')" />
          </button>
          <button v-if="!pro.active" class="button button--secondary app__menu-pro" type="button" @click="getPro">{{ t('Get pro') }}</button>
        </div>
        <div class="app__left-buttons" @click="menuOpen = false">
          <ImageOps @show-collection="collectionDialog.open()" @show-samples="sampleDialog.open()" @export-picture="painting.exportJpg()" />
          <!-- Phone: the template to print is here instead of in the tools at the bottom. -->
          <button
            v-if="!analysis.layerMode"
            class="button button--ghost app__template"
            :class="{ 'button--active': analysis.settings.view === 'template' }"
            type="button"
            :aria-pressed="analysis.settings.view === 'template'"
            :data-hint="t('Template to print')"
            @click="analysis.settings.view = analysis.settings.view === 'template' ? 'mixed' : 'template'"
          >
            <AppIcon name="template" :label="t('Template to print')" />
          </button>
          <!-- The account, and the preferences (language, light or dark) with or without one. -->
          <button class="button button--ghost" type="button" :data-hint="account.enabled ? t('Account') : t('Preferences')" @click="account.open = true">
            <AppIcon name="user" :label="account.enabled ? t('Account') : t('Preferences')" />
          </button>
        </div>
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
        <!-- Help: the labels of all buttons at once, for screens without a pointer to hover with. -->
        <button
          class="button button--ghost app__help"
          :class="{ 'button--active': hints }"
          type="button"
          :aria-pressed="hints"
          :data-hint="t('Help')"
          @click="toggleHints"
        >
          <AppIcon name="help" :label="t('Help')" />
        </button>
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
  </div>
  <!-- Over the app and over the sign-in alike. -->
  <ConsentBanner />
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
// Phone: the left column is shown with the menu button.
const menuOpen = ref(false)
// Help: every button shows its label. On a phone the left column opens with it.
const hints = ref(false)
function toggleHints() {
  hints.value = !hints.value
  if (hints.value) menuOpen.value = true
}
// Right after signing in (and agreeing, the first time) the plans come up once, unless they are paid for.
const pro = useProStore()
function getPro() {
  menuOpen.value = false
  pro.require(false, 'use everything')
}
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
