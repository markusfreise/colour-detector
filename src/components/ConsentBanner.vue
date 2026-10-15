<template>
  <aside v-if="consent.bannerVisible" class="consent" role="dialog" aria-labelledby="consent-title">
    <div class="consent__text">
      <h2 id="consent-title" class="consent__title">{{ t('Analytics cookies') }}</h2>
      <p>
        {{
          t(
            'With your permission this site uses Google Analytics to count visits. This sets cookies and sends usage data to Google. Your photos are never uploaded. You can change your choice at any time under "Privacy settings".',
          )
        }}
      </p>
    </div>
    <div class="consent__actions">
      <button class="button button--ghost" type="button" @click="consent.decide(false)">{{ t('Decline') }}</button>
      <button class="button button--ghost" type="button" @click="consent.decide(true)">{{ t('Accept') }}</button>
    </div>
  </aside>
</template>

<script setup>
import { useConsentStore } from '../stores/consent.js'
import { useText } from '../i18n/index.js'

const { t } = useText()
const consent = useConsentStore()
</script>
