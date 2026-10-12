<template>
  <dialog ref="dialog" class="panel pro" aria-labelledby="pro-title" @close="pro.dismiss()">
    <h2 id="pro-title" class="pro__title">Unlock everything</h2>
    <!-- In the app: one purchase through the App Store. -->
    <template v-if="isNative">
      <p class="pro__text">
        The free version holds one saved picture and one paint box. To {{ pro.reason }}, unlock the full version
        with a single purchase. No subscription.
      </p>
      <ul class="pro__list">
        <li>Save as many pictures as you like</li>
        <li>Keep a paint box for every set of paints you own</li>
      </ul>
      <p v-if="pro.error" class="pro__error">{{ pro.error }}</p>
      <div class="pro__actions">
        <button class="button" type="button" :disabled="pro.busy" @click="pro.purchase()">
          {{ pro.price ? `Unlock for ${pro.price}` : 'Unlock' }}
        </button>
        <button class="button button--ghost" type="button" :disabled="pro.busy" @click="pro.restore()">
          Restore purchase
        </button>
        <button class="button button--ghost" type="button" @click="dialog.close()">Not now</button>
      </div>
    </template>
    <!-- In the browser: a subscription or one payment, through the account. -->
    <template v-else>
      <p class="pro__text">The free version holds one saved picture and one paint box. To {{ pro.reason }}, choose a plan.</p>
      <ul class="pro__list">
        <li>Save as many pictures as you like</li>
        <li>Keep a paint box for every set of paints you own</li>
      </ul>
      <p v-if="account.error" class="pro__error">{{ account.error }}</p>
      <ul v-if="account.plans.length" class="pro__plans">
        <li v-for="plan in account.plans" :key="plan.id" class="pro__plan">
          <span class="pro__plan-text">
            <strong>{{ PLAN_NAMES[plan.id] ?? plan.id }}</strong>
            <span class="pro__plan-note">{{ PLAN_NOTES[plan.id] }}</span>
          </span>
          <button class="button" type="button" :disabled="account.busy" @click="account.buy(plan.id)">{{ plan.label || 'Choose' }}</button>
        </li>
      </ul>
      <p v-else class="pro__text">No plans are on offer at the moment.</p>
      <!-- A voucher for a lifetime licence only works for the address it was made out to. -->
      <form class="pro__voucher" @submit.prevent="redeem">
        <label class="field pro__voucher-field">
          <span class="field__label">Voucher for a lifetime licence</span>
          <input v-model.trim="code" class="input" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="WCL-XXXX-XXXX-XXXX" />
        </label>
        <button class="button button--secondary" type="submit" :disabled="account.busy || !code">Redeem</button>
      </form>
      <p class="pro__small">
        Payment is handled by Stripe. Prices include VAT. Details, also on what "lifetime" means, are in the
        <a href="terms/" target="_blank" rel="noopener">terms</a>.
      </p>
      <div class="pro__actions">
        <button class="button button--ghost" type="button" @click="dialog.close()">Not now</button>
      </div>
    </template>
  </dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useProStore } from '../stores/pro.js'
import { useAccountStore } from '../stores/account.js'
import { isNative } from '../lib/native.js'

const pro = useProStore()
const account = useAccountStore()
const dialog = ref(null)
const code = ref('')

async function redeem() {
  if (!(await account.redeem(code.value))) return
  code.value = ''
  account.notice = { kind: 'info', text: 'Thank you. Your lifetime licence is active.' }
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
