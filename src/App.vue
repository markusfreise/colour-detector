<template>
  <ImpersonationBar />
  <!-- With accounts on, the app opens after signing in and agreeing to the two statements. -->
  <AccountGate v-if="!account.ready" />
  <div
    v-else
    class="app"
    :class="{ 'app--layer': analysis.layerMode, 'app--hints': hints, 'app--legal': legalOpen && !isNative, 'app--menu': menuOpen && !isNative, 'app--promo': !pro.active && !pro.promoHidden }"
  >
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
      <div class="app__left toolbar" :class="{ 'app__left--open': menuOpen }">
        <div class="app__menu">
          <button class="button button--ghost app__burger" type="button" :aria-expanded="menuOpen" :data-hint="t('Menu')" @click="menuOpen = !menuOpen">
            <AppIcon name="menu" :label="t('Menu')" />
          </button>
          <GetPro class="app__menu-pro" @open="getPro" />
        </div>
        <div class="app__left-buttons" @click="menuOpen = false">
          <ImageOps @show-collection="collectionDialog.open()" @show-samples="sampleDialog.open()" @export-picture="painting.exportJpg()" />
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
          <!-- The account, and the preferences (language, light or dark) with or without one. -->
          <button class="button button--ghost" type="button" :data-hint="account.enabled ? t('Account') : t('Preferences')" @click="account.open = true">
            <AppIcon name="user" :label="account.enabled ? t('Account') : t('Preferences')" />
          </button>
          <a v-if="!isNative" class="button button--ghost app__manual" :href="legalPage('manual')" :data-hint="t('Manual')">
            <AppIcon name="manual" :label="t('Manual')" />
          </a>
          <!-- Wide window: shows the legal links below the bottom bar. A phone shows them with the menu. -->
          <button
            v-if="!isNative"
            class="button button--ghost app__legal-toggle"
            :class="{ 'button--active': legalOpen }"
            type="button"
            :aria-expanded="legalOpen"
            :data-hint="legalOpen ? null : t('Imprint & privacy')"
            @click.stop="legalOpen = !legalOpen"
          >
            <AppIcon name="info" :label="t('Imprint & privacy')" />
          </button>
          <DebugMenu />
        </div>
      </div>
      <div class="app__top">
        <LayerSteps />
        <CloseupBar />
      </div>
      <div class="app__bottom toolbar">
        <CloseupStrip />
        <LayerStrip />
      </div>
      <!-- Over the picture, moved up and down by hand: the colour that was tapped. -->
      <ColourInspector v-if="!analysis.layerMode" @breakdown="breakdown.open()" />
      <aside class="app__sidebar">
        <div class="toolbar">

          <ControlsPanel />
          <LayerList v-if="analysis.layerMode" @show-paintbox="paintBox.open()" />
          <template v-else>
            <PaletteList @show-paintbox="paintBox.open()" />
          </template>
        </div>
      </aside>
    </main>
    <LayerSheets v-if="analysis.layerMode" />
    <PrintLegend v-else />
    <LegalBar v-if="!isNative" v-model:open="legalOpen" :menu="menuOpen" />
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
import LayerSheets from './components/LayerSheets.vue'
import PaintBox from './components/PaintBox.vue'
import ConsentBanner from './components/ConsentBanner.vue'
import PrintLegend from './components/PrintLegend.vue'
import CollectionDialog from './components/CollectionDialog.vue'
import SampleDialog from './components/SampleDialog.vue'
import ProDialog from './components/ProDialog.vue'
import AppIcon from './components/AppIcon.vue'
import GetPro from './components/GetPro.vue'
import DebugMenu from './components/DebugMenu.vue'
import LegalBar from './components/LegalBar.vue'
import AccountGate from './components/AccountGate.vue'
import AccountDialog from './components/AccountDialog.vue'
import { useConsentStore } from './stores/consent.js'
import { useAccountStore } from './stores/account.js'
import ImpersonationBar from './components/ImpersonationBar.vue'
import { isNative } from './lib/native.js'
import { useProStore } from './stores/pro.js'
import { useCollectionStore } from './stores/collection.js'
import { usePaintsStore } from './stores/paints.js'
import { useLayoutStore } from './stores/layout.js'
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
// Wide window: the legal links below the bottom bar, shown with the info button.
const legalOpen = ref(false)
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
  pro.require(null, 'use everything')
}
watch(
  () => account.ready && account.welcome && account.loaded,
  (show) => {
    if (!show) return
    account.welcome = false
    if (!pro.active && account.products.length) pro.require(null, 'use everything')
  },
  { flush: 'post' },
)
// The key of the photo on screen in this account, to know whether a credit unlocked it.
watch(
  () => [analysis.picture?.hash, account.user?.pictureSalt],
  ([hash]) => hash && account.learnKeys([hash]),
  { immediate: true },
)
// A picture that changes between the Starter box and one's own paints (unlocked, a plan bought
// or ended) is mixed again with the paints it now has. A picture being analysed does that itself.
const paints = usePaintsStore()
watch(
  () => paints.starter,
  () => {
    if (analysis.busy || !analysis.pixels) return
    analysis.autoPaints()
    analysis.recomputeAllRecipes()
  },
)
// The first picture ever, once it is analysed: the settings open by themselves, once, so that
// they are found. Not for the showcase behind signing in.
const layout = useLayoutStore()
watch(
  () => !!analysis.image && !analysis.busy && !paints.showcase,
  (ready) => {
    if (ready) layout.showSettingsOnce()
  },
  { immediate: true },
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
