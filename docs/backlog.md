# Backlog – Colour Detector

Mirror of PRD §17. IDs are stable and never reused. One task = one commit.

| ID | Phase | Title | Acceptance criteria | Depends on | Status |
|---|---|---|---|---|---|
| TASK-01 | Setup | Set up Vite + Vue 3 + Pinia + Vitest project | `npm run build` and `npm test` succeed | – | Done |
| TASK-02 | Data model | Hard-code paint stock and Horadam catalogue | 54 stock paints from Notion, merged forms, conflicts noted; 140-colour catalogue | TASK-01 | Done |
| TASK-03 | Backend | Implement colour maths and mixing engine | Recipes for any target; exact paint found with ΔE < 0.5; yellow+blue → green | TASK-01 | Done |
| TASK-04 | Backend | Implement segmentation in a Web Worker | Two-colour image → 2 regions; speckles merged; UI stays responsive | TASK-01 | Done |
| TASK-05 | Frontend | Build canvas view (mixed/photo colour/photo, outlines, numbers, click-select) | Clicking an area selects its colour; views switch without re-analysis | TASK-04 | Done |
| TASK-06 | Frontend | Build controls (upload, colours, simplify, max paints) | Slider change re-analyses; max paints limits recipes | TASK-05 | Done |
| TASK-07 | Frontend | Build palette list and colour editor (recolour, alternatives, edit single area) | Picker changes area colour and recipe; detaching affects only the clicked area | TASK-03, TASK-05 | Done |
| TASK-08 | Frontend | Build paint box with enable/disable persisted in localStorage | Selection survives reload; Update mixes recomputes recipes | TASK-02 | Done |
| TASK-09 | Release | Deploy via GitHub webhook to markus-freise.de/colour-detective | Push to `main` updates the live site within ~2 min; bad signature → 403 | TASK-01 | Code done – server setup open |
| TASK-10 | Data model | Verify paint colours against own swatches and fix stock-list conflicts | Notes for 218/360/512/515 resolved; 336 identified; estimates replaced | TASK-02 | Open |
| TASK-11 | Frontend | Paint management UI: add/edit/delete paints (any vendor), pick from Horadam catalogue, JSON import/export | Custom paint usable in recipes after reload | TASK-08 | Open |
| TASK-12 | Frontend | Export printable paint-by-number sheet (outlines + numbers + recipe legend) as PNG/PDF | A4 print shows all numbered areas and recipes | TASK-07 | Open |
| TASK-13 | Frontend | Save/restore a session (image + settings + recolours) | Reload restores the last session | TASK-07 | Open |
| TASK-14 | Backend | Calibrate paints from a photo of own swatch card (wash + masstone per paint) | Calibrated colours replace estimates; mixing uses two-point absorbance | TASK-10 | Open |
| TASK-15 | Backend | Move recipe computation into the worker | No main-thread task > 100 ms on 32 colours | TASK-03 | Open |
| TASK-16 | Test | Component tests with @vue/test-utils | Editor and paint box covered | TASK-07, TASK-08 | Open |
