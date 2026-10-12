import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '../resources/scss/site.scss'

createApp(App).use(createPinia()).mount('#app')
