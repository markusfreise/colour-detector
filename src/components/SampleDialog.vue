<template>
  <dialog ref="dialog" class="panel samples" aria-labelledby="samples-title" @click="onBackdrop">
    <div class="samples__body">
      <header class="samples__header">
        <h2 id="samples-title" class="panel__title">Samples</h2>
        <button class="button button--ghost" type="button" @click="dialog.close()">Close</button>
      </header>
      <ul class="samples__list">
        <li v-for="(sample, index) in SAMPLES" :key="sample.url" class="samples__item">
          <button class="samples__open" type="button" :title="`Open ${sample.name}`" @click="open(index)">
            <img class="samples__thumb" :src="sample.url" :alt="sample.name" loading="lazy" />
            <span class="samples__name">{{ sample.name }}</span>
            <!-- Pictures from local-samples/ are only there on the dev server. -->
            <span v-if="sample.local" class="samples__tag">Only on this machine</span>
          </button>
        </li>
      </ul>
      <p class="samples__note">
        Sample images © Markus Freise. For personal use only, not for commercial use.
        <a v-if="!isNative" href="imprint/">Imprint</a>
      </p>
    </div>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useAnalysisStore, SAMPLES } from '../stores/analysis.js'
import { isNative } from '../lib/native.js'

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
