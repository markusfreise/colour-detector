<template>
  <dialog ref="dialog" class="panel account" aria-labelledby="account-title" @close="close">
    <template v-if="account.user">
      <h2 id="account-title" class="account__title">Account</h2>
      <p class="account__line">{{ account.user.email }}</p>
      <p class="account__line account__line--soft">{{ planText }}</p>
      <p class="account__line account__line--soft">Pictures, paint boxes and the collection are stored in this browser, not in your account.</p>
      <p v-if="account.error" class="account__error">{{ account.error }}</p>

      <div class="account__actions">
        <button v-if="!account.user.plan && account.plans.length" class="button" type="button" @click="upgrade">Unlock everything</button>
        <button v-if="account.user.plan === 'subscription' && lifetime" class="button button--secondary" type="button" @click="upgrade">
          Switch to a lifetime licence
        </button>
        <button v-if="account.user.billing" class="button button--ghost" type="button" :disabled="account.busy" @click="account.manage()">
          {{ account.user.plan === 'subscription' ? 'Manage subscription' : 'Invoices' }}
        </button>
        <a class="button button--ghost" :href="account.exportUrl()" target="_blank" rel="noopener">Download my data</a>
        <button class="button button--ghost" type="button" :disabled="account.busy" @click="account.signOut()">Sign out</button>
      </div>

      <!-- Deleting asks twice, here in the dialog. -->
      <div class="account__danger">
        <template v-if="confirming">
          <p class="account__line">
            Delete the account for good?
            <template v-if="account.user.plan === 'subscription'">The subscription ends at once. </template>
            <template v-if="account.user.plan === 'lifetime'">The lifetime licence is lost. </template>
            What is saved in this browser stays.
          </p>
          <div class="account__actions">
            <button class="button account__delete" type="button" :disabled="account.busy" @click="account.remove()">Yes, delete my account</button>
            <button class="button button--ghost" type="button" @click="confirming = false">Keep it</button>
          </div>
        </template>
        <button v-else class="account__link" type="button" @click="confirming = true">Delete account</button>
      </div>
    </template>
    <div class="account__actions account__actions--end">
      <button class="button button--ghost" type="button" @click="dialog.close()">Close</button>
    </div>
  </dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAccountStore } from '../stores/account.js'
import { useProStore } from '../stores/pro.js'
import { paidUntil } from '../lib/account.js'

const account = useAccountStore()
const pro = useProStore()
const dialog = ref(null)
const confirming = ref(false)

const lifetime = computed(() => account.plans.some((plan) => plan.id === 'lifetime'))
const planText = computed(() => {
  const user = account.user
  if (user.plan === 'lifetime') return 'Lifetime licence: everything is unlocked.'
  if (user.plan === 'subscription') return `Subscription: everything is unlocked${user.until ? `, paid until ${paidUntil(user.until)}` : ''}.`
  return 'Free version: one saved picture and one paint box.'
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
