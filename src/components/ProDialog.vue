<template>
  <dialog ref="dialog" class="card panel pro" aria-labelledby="pro-title" @close="pro.dismiss()">
    <h2 id="pro-title" class="pro__title">{{ !isNative && pictureOption ? t('Unlock this picture or go Pro') : t('Unlock everything') }}</h2>
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
    <!-- In the browser: a credit for this picture, a pack of pictures, or a plan, as the config offers them. -->
    <template v-else>
      <p class="pro__text">{{ intro }}</p>
      <p v-if="account.error" class="pro__error">{{ account.error }}</p>

      <!-- This picture: a credit unlocks its picture features for good. -->
      <section v-if="pictureOption" class="pro__section" :aria-label="t('This picture')">
        <h3 class="pro__heading">{{ t('This picture') }}</h3>
        <template v-if="confirming">
          <p class="pro__confirm">
            {{ t('Unlock this picture for good? Afterwards you can unlock {left} more.', { left: account.credits - 1 }) }}
            {{ t('Close-ups and changed settings stay part of it, and you can open and print it again at any time.') }}
          </p>
          <div class="pro__actions">
            <button class="button" type="button" :disabled="account.busy" @click="unlock">{{ t('Unlock') }}</button>
            <button class="button button--ghost" type="button" @click="confirming = false">{{ t('Back') }}</button>
          </div>
        </template>
        <div v-else-if="account.credits > 0" class="pro__plan">
          <span class="pro__plan-text">
            <strong>{{ t('Unlock this picture') }}</strong>
            <span class="pro__plan-note">{{ t('You can unlock {n} more', { n: account.credits }) }}</span>
          </span>
          <button class="button" type="button" :disabled="account.busy || !analysis.picture?.hash || account.offline" @click="confirming = true">{{ t('Unlock') }}</button>
        </div>
        <p v-else class="pro__text">{{ t('You have no pictures left to unlock.') }}</p>

        <ul v-if="!confirming && account.packs.length" class="pro__plans">
          <li v-for="pack in account.packs" :key="pack.key" class="pro__plan">
            <span class="pro__plan-text">
              <strong>{{ pack.quantity === 1 ? t('1 picture') : t('{n} pictures', { n: pack.quantity }) }}</strong>
              <span class="pro__plan-note">{{ t('Each unlocks one picture for good. They do not expire.') }}</span>
            </span>
            <button class="button button--secondary" type="button" :disabled="account.busy" @click="choose(pack.key)">{{ priceText(pack) }}</button>
          </li>
        </ul>
      </section>

      <section class="pro__section" :aria-label="t('Pro')">
        <h3 v-if="pictureOption" class="pro__heading">{{ t('Pro: every picture') }}</h3>
        <ul class="pro__list">
          <li>{{ t('Mix from your own paints') }}</li>
          <li>{{ t('Save as many pictures as you like') }}</li>
          <li>{{ t('Print the sheet or save it as a PDF') }}</li>
          <li>{{ t('Keep a paint box for every set of paints you own') }}</li>
        </ul>
        <!-- What was paid for pictures lately comes off the first plan (server/plans.json, credits.deduction_days). -->
        <p v-if="deduction" class="pro__deduction">{{ t("We'll deduct the {amount} you paid for pictures from your first payment.", { amount: deduction }) }}</p>
        <ul v-if="plans.length" class="pro__plans">
          <li v-for="plan in plans" :key="plan.key" class="pro__plan">
            <span class="pro__plan-text">
              <strong>{{ t(planName(plan)) }}</strong>
              <span class="pro__plan-note">{{ t(planNote(plan)) }}</span>
            </span>
            <button class="button" type="button" :disabled="account.busy" @click="choose(plan.key)">{{ priceText(plan) }}</button>
          </li>
        </ul>
        <p v-else class="pro__text">{{ t('No plans are on offer at the moment.') }}</p>
      </section>
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
        <button class="button button--ghost" type="button" @click="notNow">{{ t('Not now') }}</button>
      </div>
    </template>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useProStore } from '../stores/pro.js'
import { useAccountStore } from '../stores/account.js'
import { useAnalysisStore } from '../stores/analysis.js'
import { formatPrice } from '../lib/account.js'
import { PLANS } from '../lib/entitlements.js'
import { trackEvent } from '../lib/analytics.js'
import { isNative } from '../lib/native.js'
import { useText } from '../i18n/index.js'

const { t, legalPage, region } = useText()
const pro = useProStore()
const account = useAccountStore()
const analysis = useAnalysisStore()
const dialog = ref(null)
const code = ref('')
const confirming = ref(false) // the user chose to unlock this picture and is asked once more

// A credit helps with a picture feature, on a picture, for an account without a plan.
const pictureOption = computed(() => !!account.user && !account.user.plan && pro.creditHelps())
const intro = computed(() => {
  const reason = t(pro.reason)
  if (pictureOption.value) return t('To {reason}, unlock this picture or choose a plan.', { reason })
  if (pro.feature) return t('To {reason}, choose a plan. A picture unlocked with a credit does not include this.', { reason })
  return t('The free version mixes from the Starter box of 12 colours, and does not save pictures or print. To {reason}, unlock a picture or choose a plan.', { reason })
})
const deduction = computed(() => {
  const cents = account.user?.plan ? 0 : (account.user?.deduction ?? 0)
  return cents > 0 ? formatPrice({ amount: cents, currency: plans.value[0]?.price?.currency ?? PLANS.currency }, region.value) : ''
})
// The price as Stripe has it; "Choose" while it is not known.
const priceText = (product) => (product.price ? formatPrice(product.price, region.value) : t('Choose'))

function choose(key) {
  trackEvent('upsell_choice', { choice: key, feature: pro.feature ?? 'everything' })
  account.buy(key)
}

function notNow() {
  trackEvent('upsell_choice', { choice: 'not_now', feature: pro.feature ?? 'everything' })
  dialog.value.close()
}

async function unlock() {
  trackEvent('upsell_choice', { choice: 'unlock', feature: pro.feature ?? 'everything' })
  if (!(await account.unlock(analysis.picture?.hash))) return
  confirming.value = false
  account.notice = { kind: 'info', text: t('This picture is unlocked. {n} left to unlock.', { n: account.credits }) }
  dialog.value.close()
}

async function redeem() {
  if (!(await account.redeem(code.value))) return
  code.value = ''
  account.notice = { kind: 'info', text: t('Thank you. Your lifetime licence is active.') }
  dialog.value.close()
}

// The plans of the config (server/plans.json); credit packs are offered on their own.
const plans = computed(() => account.products.filter((p) => p.type === 'subscription' || p.type === 'lifetime'))
const planName = (plan) => (plan.type === 'lifetime' ? 'Lifetime licence' : plan.interval === 'year' ? 'Yearly' : 'Monthly')
// What "lifetime" means stands next to its price, not only in the terms.
const planNote = (plan) =>
  plan.type === 'lifetime'
    ? 'One payment, no renewal. For as long as the app is offered: the life of the product, not a promise that it runs for ever.'
    : plan.interval === 'year'
      ? 'Renews every year, cancel at any time.'
      : 'Renews every month, cancel at any time.'

watch(
  () => pro.offered,
  (offered) => {
    if (offered) {
      account.error = null
      confirming.value = false
      trackEvent('upsell_shown', { feature: pro.feature ?? 'everything', credit_offered: pictureOption.value })
      dialog.value.showModal()
    } else if (dialog.value.open) dialog.value.close()
  },
)
</script>
