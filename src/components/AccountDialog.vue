<template>
  <dialog ref="dialog" class="panel account" aria-labelledby="account-title" @close="close">
    <template v-if="account.user">
      <h2 id="account-title" class="account__title">{{ t('Account') }}</h2>
      <p class="account__line">{{ account.user.email }}</p>
      <p class="account__line account__line--soft">{{ planText }}</p>
      <p class="account__line account__line--soft">{{ t('Pictures, paint boxes and the collection are stored in this browser, not in your account.') }}</p>
      <p v-if="account.error" class="account__error">{{ account.error }}</p>

      <div class="account__actions">
        <button v-if="!account.user.plan && account.plans.length" class="button" type="button" @click="upgrade">{{ t('Unlock everything') }}</button>
        <button v-if="account.user.plan === 'subscription' && lifetime" class="button button--secondary" type="button" @click="upgrade">
          {{ t('Switch to a lifetime licence') }}
        </button>
        <button v-if="account.user.billing" class="button button--ghost" type="button" :disabled="account.busy" @click="account.manage()">
          {{ account.user.plan === 'subscription' ? t('Manage subscription') : t('Invoices') }}
        </button>
        <a class="button button--ghost" :href="account.exportUrl()" target="_blank" rel="noopener">{{ t('Download my data') }}</a>
        <button class="button button--ghost" type="button" :disabled="account.busy" @click="account.signOut()">{{ t('Sign out') }}</button>
      </div>

      <!-- Deleting asks twice, here in the dialog. -->
      <div class="account__danger">
        <template v-if="confirming">
          <p class="account__line">
            {{ t('Delete the account for good?') }}
            <template v-if="account.user.plan === 'subscription'">{{ t('The subscription ends at once. ') }}</template>
            <template v-if="account.user.plan === 'lifetime'">{{ t('The lifetime licence is lost. ') }}</template>
            {{ t('What is saved in this browser stays.') }}
          </p>
          <div class="account__actions">
            <button class="button account__delete" type="button" :disabled="account.busy" @click="account.remove()">{{ t('Yes, delete my account') }}</button>
            <button class="button button--ghost" type="button" @click="confirming = false">{{ t('Keep it') }}</button>
          </div>
        </template>
        <button v-else class="account__link" type="button" @click="confirming = true">{{ t('Delete account') }}</button>
      </div>
    </template>
    <h2 v-else id="account-title" class="account__title">{{ t('Preferences') }}</h2>

    <!-- Kept in this browser, with or without an account. -->
    <section class="account__preferences" :aria-label="t('Preferences')">
      <h3 v-if="account.user" class="account__preferences-title">{{ t('Preferences') }}</h3>
      <span id="pref-language">{{ t('Language') }}</span>
      <div class="segmented segmented--text" role="group" aria-labelledby="pref-language">
        <button
          v-for="option in languages"
          :key="option.value"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': preferences.language === option.value }"
          :aria-pressed="preferences.language === option.value"
          @click="preferences.set({ language: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
      <span id="pref-theme">{{ t('Appearance') }}</span>
      <div class="segmented segmented--text" role="group" aria-labelledby="pref-theme">
        <button
          v-for="option in themes"
          :key="option.value"
          type="button"
          class="segmented__option"
          :class="{ 'segmented__option--active': preferences.theme === option.value }"
          :aria-pressed="preferences.theme === option.value"
          @click="preferences.set({ theme: option.value })"
        >
          {{ option.label }}
        </button>
      </div>
    </section>

    <div class="account__actions account__actions--end">
      <button class="button button--ghost" type="button" @click="dialog.close()">{{ t('Close') }}</button>
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { useProStore, FREE_PAINTS } from '../stores/pro.js'
import { paidUntil } from '../lib/account.js'
import { usePreferencesStore } from '../stores/preferences.js'
import { useText } from '../i18n/index.js'

const account = useAccountStore()
const pro = useProStore()
const dialog = ref(null)
const confirming = ref(false)
const preferences = usePreferencesStore()
const { t, region } = useText()
// Each language under its own name, so that it is found whichever one is set.
const languages = computed(() => [
  { value: 'auto', label: t('Automatic') },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
])
const themes = computed(() => [
  { value: 'auto', label: t('Automatic') },
  { value: 'light', label: t('Light') },
  { value: 'dark', label: t('Dark') },
])

const lifetime = computed(() => account.plans.some((plan) => plan.id === 'lifetime'))
const planText = computed(() => {
  const user = account.user
  if (user.plan === 'lifetime') return t('Lifetime licence: everything is unlocked.')
  if (user.plan === 'subscription') {
    return user.until
      ? t('Subscription: everything is unlocked, paid until {date}.', { date: paidUntil(user.until, region.value) })
      : t('Subscription: everything is unlocked.')
  }
  return t('Free version: one paint box with up to {n} paints, no saved pictures, no print.', { n: FREE_PAINTS })
})

function upgrade() {
  dialog.value.close()
  pro.require(false, 'use everything')
}

function close() {
  account.open = false
  confirming.value = false
}

watch(
  () => account.open,
  (open) => {
    if (open) {
      account.error = null
      dialog.value.showModal()
    } else if (dialog.value.open) dialog.value.close()
  },
)
</script>
