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
| TASK-12 | Frontend | Export printable paint-by-number sheet (outlines + numbers + recipe legend) as PNG/PDF | A4 print shows all numbered areas and recipes | TASK-07 | Done – via the browser's print dialog (Save as PDF) |
| TASK-13 | Frontend | Save/restore a session (image + settings + recolours) | Reload restores the last session | TASK-07 | Open |
| TASK-14 | Backend | Calibrate paints from a photo of own swatch card (wash + masstone per paint) | Calibrated colours replace estimates; mixing uses two-point absorbance | TASK-10 | Open |
| TASK-15 | Backend | Move recipe computation into the worker | No main-thread task > 100 ms on 32 colours | TASK-03 | Open |
| TASK-16 | Test | Component tests with @vue/test-utils | Editor and paint box covered | TASK-07, TASK-08 | Open |
| TASK-17 | Frontend | Chip layouts for paint box, recipes and colour editor; paint box grouped by form (pans, tubes) then colour-wheel family, sorted by number | Paints show as coloured chips with bold three-digit number; recipes and editor match the Figma frames | TASK-07, TASK-08 | Done |
| TASK-18 | Frontend | Open the paint box as a centred overlay from a button in the Colours panel; framed Pans/Tubes groups with All/Invert/None; compact controls (three-column settings, full-width Show buttons) | Button opens the overlay; Esc, Close and backdrop click close it; pending changes are applied on close | TASK-17 | Done |
| TASK-19 | Frontend | Paint box: selected paints in a box at the top (click removes), remaining paints below under Pans and Tubes as plain grids without family names (click adds) | Clicking a chip moves it between the two areas | TASK-18 | Done |
| TASK-20 | Frontend | Auto button in the paint box: propose the paints that suit the current picture | Auto replaces the selection with a small set that mixes all colours of the picture | TASK-19 | Done |
| TASK-21 | Frontend | Consent banner for Google Analytics (GDPR): nothing loads before consent, choice can be changed | Analytics script is only requested after Accept; Decline and later withdrawal stop it; no banner without a measurement ID | TASK-05 | Code done – measurement ID open |
| TASK-22 | Frontend | Show P / T (pan / tube) on selected paints and in recipes | Collector chips and recipe ingredients carry P, T or P/T | TASK-19 | Done |
| TASK-23 | Frontend | Second sample photo (street at dusk); Sample button steps through the samples | New sample loads at start; Sample switches to the next one | TASK-06 | Done |
| TASK-24 | Frontend | Several paint boxes, own paints of any brand in the library, picture collection (save, open, rename, delete), "Take photo" | A second box keeps its own selection; an added paint mixes; a saved picture reopens with settings and colour changes | TASK-19 | Done |
| TASK-25 | App | Native iOS/iPadOS/macOS app "Tintmap" in `app/` (SwiftUI): everything of the web app plus camera, StoreKit purchase (4,99 EUR one-time: more than one saved picture and paint box), PDF/print, App Store texts, temporary icon | Builds and runs on iPhone, iPad and Mac; logic tests pass | TASK-24 | Code done – App Store Connect setup, support/privacy pages, final icon and device test open |
| TASK-26 | App | Tintmap UI pass: cards with shadow, three-column settings, larger controls and type, recipes as tile plus paint rows, text toolbar (Library, Save, New Image), Print / PDF / Paint box on the Colours card, paint box actions as buttons, bigger picture numbers, fourth view "Overlay" (areas at 50% over the photo) | Checked on Mac, iPad and iPhone | TASK-25 | Done |
| TASK-27 | Logic | Keep colour variety and save mixes: weighted k-means on the colour histogram (hue and saturation count more than lightness, large areas weigh less); colours that differ only in strength share one mix as washes, labelled by mix number and water level (6L, 6R) and grouped in the list; saturation and contrast sliders; defaults 20 colours and no simplification; portrait as first sample; paint box on Auto by default; working size by area instead of longest side | Portrait sample: 20 colours from 6 mixes, lips and skin tones kept; street sample shows the red roofs | TASK-03 | Web done – port to `app/` (Swift) open |
