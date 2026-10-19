<template>
  <div class="admin">
    <header class="admin__head">
      <h1 class="admin__title">Watercolourlove admin</h1>
      <span v-if="me" class="admin__me">{{ me.email }}<template v-if="me.superadmin"> · superadmin</template></span>
      <a class="button button--ghost" href="../">Back to the app</a>
    </header>

    <p v-if="error" class="admin__message admin__message--error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin__message" role="status">{{ notice }}</p>

    <p v-if="denied" class="admin__message">
      This page is for admins. Sign in to the app with an admin account first, then come back here.
    </p>

    <template v-else-if="me">
      <form class="admin__search" role="search" @submit.prevent="load(0)">
        <input v-model="query" class="input" type="search" placeholder="Search by e-mail address" aria-label="Search by e-mail address" />
        <button class="button" type="submit" :disabled="busy">Search</button>
      </form>

      <div class="admin__layout">
        <div class="admin__list">
          <p class="admin__count">{{ total }} {{ total === 1 ? 'account' : 'accounts' }}</p>
          <table class="admin__table">
            <thead>
              <tr>
                <th scope="col">E-mail</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                <th scope="col" class="admin__number">Credits</th>
                <th scope="col">Since</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="user in users"
                :key="user.id"
                class="admin__row"
                :class="{ 'admin__row--selected': selected?.id === user.id, 'admin__row--banned': user.status === 'banned' }"
                @click="select(user)"
              >
                <td><button class="admin__pick" type="button" @click.stop="select(user)">{{ user.email }}</button></td>
                <td>{{ user.role }}</td>
                <td>{{ user.status }}</td>
                <td>{{ planLabel(user) }}</td>
                <td class="admin__number">{{ user.credits }}</td>
                <td>{{ day(user.created) }}</td>
              </tr>
              <tr v-if="!users.length">
                <td colspan="6" class="admin__empty">No account matches.</td>
              </tr>
            </tbody>
          </table>
          <div class="admin__paging">
            <button class="button button--ghost" type="button" :disabled="busy || offset === 0" @click="load(Math.max(0, offset - users.length))">Previous</button>
            <button class="button button--ghost" type="button" :disabled="busy || !more" @click="load(offset + users.length)">Next</button>
          </div>
        </div>

        <section v-if="selected" class="card admin__detail" aria-labelledby="admin-detail-title">
          <h2 id="admin-detail-title" class="admin__detail-title">{{ selected.email }}</h2>
          <dl class="admin__facts">
            <dt>Account since</dt>
            <dd>{{ day(selected.created) }}</dd>
            <dt>Signs in with</dt>
            <dd>{{ ['e-mail link', ...selected.signInWith].join(', ') }}</dd>
            <dt>Plan</dt>
            <dd>
              {{ planLabel(selected) }}<template v-if="selected.subscription?.until">, until {{ day(selected.subscription.until) }}</template>
            </dd>
            <dt>Credits</dt>
            <dd>{{ selected.credits }}</dd>
          </dl>

          <p v-if="!canEdit" class="admin__hint">{{ lockedReason }}</p>

          <template v-if="canEdit">
            <div class="field">
              <label class="field__label" for="admin-role">Role</label>
              <select v-if="me.superadmin" id="admin-role" class="input input--select" :value="selected.role" :disabled="busy" @change="change({ role: $event.target.value })">
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <p v-else class="field__hint">{{ selected.role }} (only a superadmin changes roles)</p>
            </div>

            <div class="field">
              <span id="admin-status" class="field__label">Status</span>
              <div class="segmented segmented--text" role="group" aria-labelledby="admin-status">
                <button
                  v-for="option in statuses"
                  :key="option.value"
                  type="button"
                  class="segmented__option"
                  :class="{ 'segmented__option--active': selected.status === option.value }"
                  :aria-pressed="selected.status === option.value"
                  :disabled="busy"
                  @click="setStatus(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <p class="field__hint">{{ statuses.find((s) => s.value === selected.status)?.hint }}</p>
            </div>
            <div v-if="confirming === 'ban'" class="admin__confirm">
              <p>Ban {{ selected.email }}? They are signed out at once, a running subscription ends at Stripe, and the address can never sign in again, not even after the account is deleted.</p>
              <div class="admin__actions">
                <button class="button admin__danger" type="button" :disabled="busy" @click="change({ status: 'banned' })">Ban</button>
                <button class="button button--ghost" type="button" @click="confirming = ''">Cancel</button>
              </div>
            </div>

            <form class="field" @submit.prevent="change({ email: email })">
              <label class="field__label" for="admin-email">E-mail address</label>
              <div class="admin__inline">
                <input id="admin-email" v-model="email" class="input" type="email" required />
                <button class="button" type="submit" :disabled="busy || email.trim().toLowerCase() === selected.email">Save</button>
              </div>
            </form>
          </template>

          <div class="admin__actions admin__actions--block">
            <button class="button button--ghost" type="button" :disabled="busy" @click="download">Download data</button>
            <template v-if="canEdit">
              <button class="button button--ghost" type="button" :disabled="busy || selected.status === 'banned'" @click="impersonate">Log in as this user</button>
              <button class="button button--ghost" type="button" :disabled="busy || !paid" @click="confirming = 'free'">Back to free</button>
              <button class="button button--ghost admin__danger-text" type="button" :disabled="busy" @click="confirming = 'delete'">Delete for good</button>
            </template>
          </div>

          <div v-if="confirming === 'free'" class="admin__confirm">
            <p>
              Back to the free version? A running subscription ends at Stripe at once, without a refund; a lifetime licence and an unlock by hand are taken away. The account, its credits and unlocked pictures stay. Refunds are made in the Stripe dashboard.
            </p>
            <div class="admin__actions">
              <button class="button admin__danger" type="button" :disabled="busy" @click="makeFree">Back to free</button>
              <button class="button button--ghost" type="button" @click="confirming = ''">Cancel</button>
            </div>
          </div>

          <form v-if="confirming === 'delete'" class="admin__confirm" @submit.prevent="remove">
            <p>
              Delete {{ selected.email }} for good? Everything stored about the account goes, a running subscription ends at Stripe, and it cannot be undone.<template v-if="selected.status === 'banned'"> The address stays banned.</template>
            </p>
            <label class="field__label" for="admin-delete">Type the address to confirm</label>
            <input id="admin-delete" v-model="deleteTyped" class="input" type="email" autocomplete="off" />
            <div class="admin__actions">
              <button class="button admin__danger" type="submit" :disabled="busy || deleteTyped.trim().toLowerCase() !== selected.email">Delete for good</button>
              <button class="button button--ghost" type="button" @click="confirming = ''">Cancel</button>
            </div>
          </form>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { API, call, editable, planLabel } from './api.js'

const statuses = [
  { value: 'regular', label: 'Regular', hint: 'What they paid for decides what they can use.' },
  { value: 'unlocked', label: 'Unlocked', hint: 'Everything unlocked by hand, as with a lifetime licence, without paying.' },
  { value: 'banned', label: 'Banned', hint: 'Signed out and can never sign in again.' },
]

const me = ref(null)
const users = ref([])
const total = ref(0)
const more = ref(false)
const offset = ref(0)
const query = ref('')
const selected = ref(null)
const email = ref('')
const deleteTyped = ref('')
const confirming = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const denied = ref(false)

const canEdit = computed(() => editable(me.value, selected.value))
const paid = computed(() => selected.value && (selected.value.plan !== null || selected.value.subscription?.status === 'past_due'))
const lockedReason = computed(() => {
  const user = selected.value
  if (user.id === me.value.id) return 'This is your own account. Change it in the app.'
  if (user.role === 'superadmin') return 'Superadmins are set in config.php on the server and cannot be changed here.'
  return 'Only a superadmin can change another admin.'
})

const day = (seconds) => new Date(seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Runs a request with the page busy; a message on failure, the answer otherwise. */
async function attempt(request) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    return await request()
  } catch (failure) {
    // Not signed in, or not as an admin: the page says so itself.
    denied.value = denied.value || ((failure.status === 401 || failure.status === 403) && (!me.value || failure.message === 'Admins only.'))
    error.value = denied.value ? '' : failure.message
    return null
  } finally {
    busy.value = false
  }
}

async function load(from) {
  const data = await attempt(() => call(`admin/users?${new URLSearchParams({ q: query.value.trim(), offset: from })}`))
  if (!data) return
  me.value = data.me
  users.value = data.users
  total.value = data.total
  more.value = data.more
  offset.value = from
  if (selected.value) selected.value = data.users.find((u) => u.id === selected.value.id) ?? null
}

function select(user) {
  selected.value = user
}

/** The listed account replaced by what the server answered. */
function replace(user) {
  users.value = users.value.map((u) => (u.id === user.id ? user : u))
  selected.value = user
}

async function change(changes) {
  const data = await attempt(() => call(`admin/users/${selected.value.id}`, changes))
  confirming.value = ''
  if (data) {
    replace(data.user)
    notice.value = `Saved for ${data.user.email}.`
  } else {
    // A refused change leaves the controls as the server has them.
    selected.value = { ...selected.value }
  }
}

function setStatus(status) {
  if (status === selected.value.status) return
  if (status === 'banned') confirming.value = 'ban'
  else change({ status })
}

async function makeFree() {
  const data = await attempt(() => call(`admin/users/${selected.value.id}/free`, {}))
  confirming.value = ''
  if (data) {
    replace(data.user)
    notice.value = `${data.user.email} is on the free version now.`
  }
}

async function remove() {
  const gone = selected.value
  const data = await attempt(() => call(`admin/users/${gone.id}/delete`, {}))
  if (!data) return
  confirming.value = ''
  selected.value = null
  await load(offset.value)
  notice.value = `${gone.email} is deleted.`
}

/** Signs in as the account in this browser and opens the app; the app shows the way back. */
async function impersonate() {
  if (await attempt(() => call(`admin/users/${selected.value.id}/impersonate`, {}))) window.location.href = '../'
}

async function download() {
  const user = selected.value
  const response = await attempt(async () => {
    const answer = await fetch(`${API}/admin/users/${user.id}/export`, { credentials: 'same-origin' })
    if (!answer.ok) throw Object.assign(new Error((await answer.json().catch(() => ({}))).error ?? 'The download failed.'), { status: answer.status })
    return answer.blob()
  })
  if (!response) return
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(response),
    download: `watercolourlove-${user.email.replace(/[^a-z0-9.@_-]/gi, '_')}.json`,
  })
  link.click()
  URL.revokeObjectURL(link.href)
}

watch(selected, (user) => {
  email.value = user?.email ?? ''
  deleteTyped.value = ''
})
watch(() => selected.value?.id, () => (confirming.value = ''))

onMounted(() => load(0))
</script>
