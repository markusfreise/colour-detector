<template>
  <!-- Above the picture while a part of it is on screen. -->
  <div v-if="closeup" class="closeup closeup--bar">
    <!-- Which part it is shows in the strip at the bottom, where it is highlighted. -->
    <button class="button button--secondary" type="button" :disabled="analysis.busy" :aria-label="t('Return to base image')" @click="analysis.showBase()">{{ t('Back') }}</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const analysis = useAnalysisStore()
const closeup = computed(() => analysis.closeups.find((c) => c.id === analysis.closeupId) ?? null)
</script>
