<template>
  <dialog ref="dialog" class="card panel samples" aria-labelledby="samples-title" @click="onBackdrop">
    <div class="samples__body">
      <header class="samples__header">
        <h2 id="samples-title" class="panel__title">{{ t('Samples') }}</h2>
        <button class="button button--ghost" type="button" @click="dialog.close()">{{ t('Close') }}</button>
      </header>
      <ul class="samples__list">
        <li v-for="(sample, index) in SAMPLES" :key="sample.url" class="samples__item">
          <button class="samples__open" type="button" :title="t('Open {name}', { name: t(sample.name) })" @click="open(index)">
            <img class="samples__thumb" :src="sample.url" :alt="t(sample.name)" loading="lazy" />
            <span class="samples__name">{{ t(sample.name) }}</span>
            <!-- Pictures from local-samples/ are only there on the dev server. -->
            <span v-if="sample.local" class="samples__tag">{{ t('Only on this machine') }}</span>
          </button>
          <a v-if="sample.credit" class="samples__credit" :href="sample.credit.url" target="_blank" rel="noopener">
            {{ t('Photo: {name} / Unsplash', { name: sample.credit.name }) }}
          </a>
        </li>
      </ul>
      <p class="samples__note">
        {{ t('Sample photos under the Unsplash License.') }}
        <a v-if="!isNative" :href="legalPage('imprint')">{{ t('Imprint') }}</a>
      </p>
    </div>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useAnalysisStore, SAMPLES } from '../stores/analysis.js'
import { isNative } from '../lib/native.js'
import { useText } from '../i18n/index.js'

const { t, legalPage } = useText()
const analysis = useAnalysisStore()
const dialog = ref(null)

defineExpose({ open: () => dialog.value.showModal() })

function onBackdrop(event) {
  if (event.target === dialog.value) dialog.value.close()
}

async function open(index) {
  dialog.value.close()
  await analysis.loadSample(index)
}
</script>
