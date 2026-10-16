import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { usePreferencesStore } from './stores/preferences.js'
import { setMixBase } from './lib/mixClient.js'
import { MIX_API } from './config.js'
import '../resources/scss/site.scss'

setMixBase(MIX_API)
const pinia = createPinia()
// Theme and language before the first paint, so that nothing flashes in the wrong one.
usePreferencesStore(pinia).apply()
createApp(App).use(pinia).mount('#app')
