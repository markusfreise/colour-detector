import { createApp } from 'vue'
import AdminApp from './AdminApp.vue'
import '../../resources/scss/site.scss'

// The admin page (server/admin.php): accounts listed and changed by hand. English only.
createApp(AdminApp).mount('#admin')
