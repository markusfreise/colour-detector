import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { usePreferencesStore } from './stores/preferences.js'
import '../resources/scss/site.scss'

const pinia = createPinia()
// Theme and language before the first paint, so that nothing flashes in the wrong one.
usePreferencesStore(pinia).apply()
createApp(App).use(pinia).mount('#app')
