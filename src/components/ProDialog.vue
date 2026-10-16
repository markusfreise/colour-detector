<template>
  <dialog ref="dialog" class="card panel pro" aria-labelledby="pro-title" @close="pro.dismiss()">
    <h2 id="pro-title" class="pro__title">{{ t('Unlock everything') }}</h2>
    <!-- In the app: one purchase through the App Store. -->
    <template v-if="isNative">
      <p class="pro__text">
        {{
          t('The free version holds one saved picture and one paint box. To {reason}, unlock the full version with a single purchase. No subscription.', {
            reason: t(pro.reason),
          })
        }}
      </p>
      <ul class="pro__list">
        <li>{{ t('Save as many pictures as you like') }}</li>
        <li>{{ t('Keep a paint box for every set of paints you own') }}</li>
      </ul>
      <p v-if="pro.error" class="pro__error">{{ pro.error }}</p>
      <div class="pro__actions">
        <button class="button" type="button" :disabled="pro.busy" @click="pro.purchase()">
          {{ pro.price ? t('Unlock for {price}', { price: pro.price }) : t('Unlock') }}
        </button>
        <button class="button button--ghost" type="button" :disabled="pro.busy" @click="pro.restore()">
          {{ t('Restore purchase') }}
        </button>
        <button class="button button--ghost" type="button" @click="dialog.close()">{{ t('Not now') }}</button>
      </div>
    </template>
    <!-- In the browser: a subscription or one payment, through the account. -->
    <template v-else>
      <p class="pro__text">
        {{
          t('The free version mixes from up to {n} paints in one paint box, and does not save pictures or print. To {reason}, choose a plan.', {
            n: FREE_PAINTS,
            reason: t(pro.reason),
          })
        }}
      </p>
      <ul class="pro__list">
        <li>{{ t('Save as many pictures as you like') }}</li>
        <li>{{ t('Print the sheet or save it as a PDF') }}</li>
        <li>{{ t('Mix from all your paints') }}</li>
        <li>{{ t('Keep a paint box for every set of paints you own') }}</li>
      </ul>
      <p v-if="account.error" class="pro__error">{{ account.error }}</p>
      <ul v-if="account.plans.length" class="pro__plans">
        <li v-for="plan in account.plans" :key="plan.id" class="pro__plan">
          <span class="pro__plan-text">
            <strong>{{ PLAN_NAMES[plan.id] ? t(PLAN_NAMES[plan.id]) : plan.id }}</strong>
            <span class="pro__plan-note">{{ PLAN_NOTES[plan.id] ? t(PLAN_NOTES[plan.id]) : '' }}</span>
          </span>
          <button class="button" type="button" :disabled="account.busy" @click="account.buy(plan.id)">{{ plan.label ? t(plan.label) : t('Choose') }}</button>
        </li>
      </ul>
      <p v-else class="pro__text">{{ t('No plans are on offer at the moment.') }}</p>
      <!-- A voucher for a lifetime licence only works for the address it was made out to. -->
      <form class="pro__voucher" @submit.prevent="redeem">
        <label class="field pro__voucher-field">
          <span class="field__label">{{ t('Voucher for a lifetime licence') }}</span>
          <input v-model.trim="code" class="input" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="WCL-XXXX-XXXX-XXXX" />
        </label>
        <button class="button button--secondary" type="submit" :disabled="account.busy || !code">{{ t('Redeem') }}</button>
      </form>
      <p class="pro__small">
        {{ t('Payment is handled by Stripe. Prices include VAT. Details, also on what "lifetime" means, are in the') }}
        <a :href="legalPage('terms')" target="_blank" rel="noopener">{{ t('terms') }}</a>.
      </p>
      <div class="pro__actions">
        <button class="button button--ghost" type="button" @click="dialog.close()">{{ t('Not now') }}</button>
      </div>
    </template>
  </dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useProStore, FREE_PAINTS } from '../stores/pro.js'
import { useAccountStore } from '../stores/account.js'
import { isNative } from '../lib/native.js'
import { useText } from '../i18n/index.js'

const { t, legalPage } = useText()
const pro = useProStore()
const account = useAccountStore()
const dialog = ref(null)
const code = ref('')

async function redeem() {
  if (!(await account.redeem(code.value))) return
  code.value = ''
  account.notice = { kind: 'info', text: t('Thank you. Your lifetime licence is active.') }
  dialog.value.close()
}

const PLAN_NAMES = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime licence' }
// What "lifetime" means stands next to its price, not only in the terms.
const PLAN_NOTES = {
  monthly: 'Renews every month, cancel at any time.',
  yearly: 'Renews every year, cancel at any time.',
  lifetime: 'One payment, no renewal. For as long as the app is offered: the life of the product, not a promise that it runs for ever.',
}

watch(
  () => pro.offered,
  (offered) => {
    if (offered) {
      account.error = null
      dialog.value.showModal()
    } else if (dialog.value.open) dialog.value.close()
  },
)
</script>
