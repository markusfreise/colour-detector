<template>
  <!-- Cookies: the necessary ones are listed, Google Analytics waits for a yes. Rejecting is as
       easy as accepting, and nothing is ticked in advance. -->
  <aside v-if="consent.bannerVisible" class="card consent" role="dialog" aria-labelledby="consent-title">
    <h2 id="consent-title" class="consent__title">{{ t('Cookies and statistics') }}</h2>
    <p class="consent__text">
      {{
        t(
          'Some cookies are needed to sign in. With your permission this site also uses Google Analytics to count visits: that sets cookies and sends usage data to Google, also to the USA. Your photos are never uploaded. You can change your choice at any time under "Privacy settings".',
        )
      }}
      <a :href="legalPage('privacy')" target="_blank" rel="noopener">{{ t('Privacy policy') }}</a> ·
      <a :href="legalPage('imprint')" target="_blank" rel="noopener">{{ t('Imprint') }}</a>
    </p>

    <ul v-if="consent.details" class="consent__categories">
      <li class="consent__category">
        <label class="checkbox consent__switch">
          <input type="checkbox" checked disabled />
          <span class="consent__name">{{ t('Necessary') }} <span class="consent__always">{{ t('always on') }}</span></span>
        </label>
        <p class="consent__about">
          {{
            t(
              'Keep you signed in (cookie cd_session, 60 days) and protect signing in with another service (cd_state, 10 minutes). Your settings, paint boxes and pictures stay in the storage of this browser.',
            )
          }}
        </p>
      </li>
      <li class="consent__category">
        <label class="checkbox consent__switch">
          <input v-model="consent.analytics" type="checkbox" />
          <span class="consent__name">{{ t('Statistics (Google Analytics)') }}</span>
        </label>
        <p class="consent__about">
          {{
            t(
              'Counts visits and which functions are used, without advertising. Cookies _ga and _ga_*, kept for up to two years. Provider: Google Ireland Ltd.; data can reach Google LLC in the USA (EU-US Data Privacy Framework).',
            )
          }}
        </p>
      </li>
    </ul>

    <div class="consent__actions">
      <button class="button" type="button" @click="consent.decide(false)">{{ t('Reject all') }}</button>
      <button v-if="consent.details" class="button" type="button" @click="consent.decide(consent.analytics)">{{ t('Save choice') }}</button>
      <button v-else class="button" type="button" @click="consent.showDetails()">{{ t('Settings') }}</button>
      <button class="button" type="button" @click="consent.decide(true)">{{ t('Accept all') }}</button>
    </div>
  </aside>
</template>

<script setup>
import { useConsentStore } from '../stores/consent.js'
import { useText } from '../i18n/index.js'

const { t, legalPage } = useText()
const consent = useConsentStore()
</script>
