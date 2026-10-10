<template>
  <dialog ref="dialog" class="panel pro" aria-labelledby="pro-title" @close="pro.dismiss()">
    <h2 id="pro-title" class="pro__title">Unlock everything</h2>
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
  </dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useProStore } from '../stores/pro.js'

const pro = useProStore()
const dialog = ref(null)

watch(
  () => pro.offered,
  (offered) => {
    if (offered) dialog.value.showModal()
    else if (dialog.value.open) dialog.value.close()
  },
)
</script>
