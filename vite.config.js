import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative base: the build works at any path, e.g. https://markus-freise.de/colour-detective/
  base: './',
  plugins: [vue()],
  worker: { format: 'es' },
  test: { environment: 'node' },
})
