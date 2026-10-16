<template>
  <!-- How many pictures the account can still unlock with a credit; beside "Get pro" and in the collection. -->
  <span v-if="shown" class="credits" :title="t('Pictures you can still unlock: {n}', { n: account.credits })">
    {{ account.credits === 1 ? t('1 picture') : t('{n} pictures', { n: account.credits }) }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const account = useAccountStore()
// Only for an account without a plan: a plan unlocks every picture.
const shown = computed(() => account.enabled && !!account.user && !account.user.plan)
</script>
