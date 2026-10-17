<template>
  <!-- Until everything is unlocked: the plans, one click away, as a button like the others around
       the picture. Its cross hides it for this session; the locked buttons stay ghosted. -->
  <span v-if="!pro.active && !pro.promoHidden" class="getpro">
    <button class="getpro__open" type="button" @click="emit('open')">
      {{ t('Get pro') }}
      <CreditCount />
    </button>
    <button class="getpro__close" type="button" :title="t('Hide')" :aria-label="t('Hide “Get pro” for this session')" @click="pro.hidePromo()">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
      </svg>
    </button>
  </span>
</template>

<script setup>
import { useProStore } from '../stores/pro.js'
import CreditCount from './CreditCount.vue'
import { useText } from '../i18n/index.js'

const { t } = useText()
const pro = useProStore()
const emit = defineEmits(['open'])
</script>
