<template>
  <!-- An admin signed in as somebody else (server/admin.php): always in view, with the way back. -->
  <p v-if="account.impersonatedBy && account.user" class="impersonation" role="status">
    {{ t('Signed in as {email} by {admin}.', { email: account.user.email, admin: account.impersonatedBy }) }}
    <button class="button" type="button" :disabled="account.busy" @click="account.returnToAdmin()">{{ t('Back to admin') }}</button>
  </p>
</template>

<script setup>
import { useAccountStore } from '../stores/account.js'
import { t } from '../i18n/index.js'

const account = useAccountStore()
</script>
