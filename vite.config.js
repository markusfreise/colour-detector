import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The pages under public/ (manual, privacy, terms, imprint) are linked as folders. A web server
// answers a folder with its index.html; the dev and preview servers would answer with the app
// instead, so a click on such a link only reloaded the app. Here they get the page of the folder.
const folderPages = () => {
  // No return value: a function returned from the hook would be run by Vite as a later step.
  const serve = (server) => {
    server.middlewares.use((req, _res, next) => {
      const path = req.url.split('?')[0]
      if (path.endsWith('/') && path !== '/' && !path.includes('..') && existsSync(`public${path}index.html`)) req.url = `${path}index.html`
      next()
    })
  }
  return { name: 'folder-pages', configureServer: serve, configurePreviewServer: serve }
}

export default defineConfig({
  // Relative base: the build works at any path, e.g. https://markus-freise.de/colour-detective/
  base: './',
  plugins: [vue(), folderPages()],
  // devSourcemap: the browser's inspector shows the .scss file and line in `npm run dev`
  css: { devSourcemap: true, preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  // The account API for local tests: php -S 127.0.0.1:8787 server/index.php
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  worker: { format: 'es' },
  test: { environment: 'node' },
})
