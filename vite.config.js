import { existsSync, readdirSync } from 'node:fs'
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

// Sample pictures that stay on this machine: the dev server serves the folder as it is, a build
// gets an empty list and so never contains them.
const localSamples = (command) =>
  command === 'serve' && existsSync('local-samples') ? readdirSync('local-samples').filter((file) => /\.(webp|jpe?g|png)$/i.test(file)) : []

// The mixing model, the search for recipes and the planning of layers are answered by the server
// (server/mix/, api/mix/): their JavaScript is the reference for tests and must never be part of
// the app that goes to the browser. A build that would carry one of them stops.
const SERVER_ONLY = ['src/lib/mixing.js', 'src/lib/mixes.js', 'src/lib/layerPlan.js', 'src/lib/mixService.js', 'src/data/horadam-catalogue.js', 'src/data/winsor-newton-catalogue.js', 'src/data/michael-harding-catalogue.js']
const serverOnly = () => ({
  name: 'server-only',
  generateBundle(_, bundle) {
    const root = `${process.cwd()}/`
    for (const chunk of Object.values(bundle)) {
      for (const id of Object.keys(chunk.modules ?? {})) {
        const file = id.startsWith(root) ? id.slice(root.length) : id
        if (SERVER_ONLY.includes(file)) this.error(`${file} belongs to the server and would go into ${chunk.fileName}`)
      }
    }
  },
})

export default defineConfig(({ command }) => ({
  // Relative base: the build works at any path, e.g. https://markus-freise.de/colour-detective/
  base: './',
  plugins: [vue(), folderPages(), serverOnly()],
  define: { __LOCAL_SAMPLES__: JSON.stringify(localSamples(command)) },
  // devSourcemap: the browser's inspector shows the .scss file and line in `npm run dev`
  css: { devSourcemap: true, preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  // The account API for local tests: php -S 127.0.0.1:8787 server/index.php
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  worker: { format: 'es', plugins: () => [serverOnly()] },
  test: { environment: 'node' },
}))
