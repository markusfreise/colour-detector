import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative base: the build works at any path, e.g. https://markus-freise.de/colour-detective/
  base: './',
  plugins: [vue()],
  // The account API for local tests: php -S 127.0.0.1:8787 server/index.php
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  worker: { format: 'es' },
  test: { environment: 'node' },
})
