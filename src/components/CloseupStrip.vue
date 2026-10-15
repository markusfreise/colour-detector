<template>
  <!-- The parts of the picture looked at so far, under the picture: one click goes back to each. -->
  <ul v-if="analysis.closeups.length" class="closeup closeup--strip" :aria-label="t('Details of the picture')">
    <li v-for="closeup in analysis.closeups" :key="closeup.id" class="closeup__item" :class="{ 'closeup__item--active': closeup.id === analysis.closeupId }">
      <button
        class="closeup__open"
        type="button"
        :aria-pressed="closeup.id === analysis.closeupId"
        :title="t('Show detail {n}', { n: closeup.number })"
        @click="analysis.openCloseup(closeup.id)"
      >
        <img class="closeup__thumb" :src="closeup.thumb" :alt="t('Detail {n}', { n: closeup.number })" />
        <span class="closeup__number">{{ closeup.number }}</span>
      </button>
      <button class="closeup__remove" type="button" :title="t('Remove detail {n}', { n: closeup.number })" :aria-label="t('Remove detail {n}', { n: closeup.number })" @click="analysis.removeCloseup(closeup.id)">
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </li>
  </ul>
</template>

<script setup>
import { useAnalysisStore } from '../stores/analysis.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
</script>
