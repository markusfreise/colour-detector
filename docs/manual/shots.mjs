// The screenshots of the manual. Each shot opens the app in a fresh browser (English, then German),
// loads a sample unless `sample: null`, prepares the screen and cuts out a part. Markers are numbered
// in the order given here and explained by a numbered list right under the picture in the chapter.
// In Markdown: ![Caption](shot:<id>).
//
// Fields:
//   id          file name, public/manual/img/<lang>/<id>.webp
//   sample      index into SAMPLES of the app (default 1, Llyn Idwal); null for the empty app
//   settings    analysis settings applied before the sample is loaded
//   mode        'layer' switches to layer mode after loading
//   collapsed   panels folded or open: { controls, palette }, both folded by default
//   viewport    { width, height }, default 1440 x 900
//   prepare     async (page, { t, store, idle }) => {...}; t() gives the app's text in the shot's language
//   target      (page, t) => Locator, the part to cut out; the whole window without it
//   padding     room around the target in px (default 16)
//   markers     list of (page, t) => Locator, or { locate, at, dx, dy }
//               at: tl | tr | l | r | c | t | b | bl | br, the corner or edge of the element

const hint = (page, t, text) => page.locator(`[data-hint="${t(text)}"]`).first()
const dialog = (page) => page.locator('dialog[open]').first()
const settingsCard = (page) => page.locator('.flyout').filter({ has: page.locator('.field__range') }).first()
const coloursCard = (page) => page.locator('.flyout').filter({ has: page.locator('.palette__list') }).first()

// A tap on the picture at a share of its width and height.
async function tapPicture(page, x, y) {
  const canvas = page.locator('.painting canvas').first()
  const b = await canvas.boundingBox()
  await page.mouse.click(b.x + b.width * x, b.y + b.height * y)
}

export const shots = [
  // ------------------------------------------------------------------ Getting started
  {
    id: 'welcome',
    sample: null,
    markers: [
      { locate: (p, t) => hint(p, t, 'New picture'), at: 'r' },
      { locate: (p, t) => hint(p, t, 'Samples'), at: 'r' },
      { locate: (p) => p.locator('.painting__welcome').first(), at: 't' },
    ],
  },
  {
    id: 'overview',
    markers: [
      { locate: (p, t) => hint(p, t, 'New picture'), at: 'r' },
      { locate: (p, t) => hint(p, t, 'Fit'), at: 'b' },
      { locate: (p, t) => hint(p, t, 'Mixed paint'), at: 'b' },
      { locate: (p, t) => hint(p, t, 'Colours'), at: 'l' },
      { locate: (p, t) => hint(p, t, 'Settings'), at: 'l' },
      { locate: (p, t) => hint(p, t, 'Paint box'), at: 'l' },
      { locate: (p, t) => hint(p, t, 'Help'), at: 'l' },
    ],
  },
  {
    id: 'samples',
    sample: null,
    prepare: async (page, { t }) => {
      await hint(page, t, 'Samples').click()
    },
    target: (page) => dialog(page),
  },
  {
    id: 'phone',
    viewport: { width: 390, height: 844 },
  },
  {
    id: 'help-labels',
    prepare: async (page, { t }) => {
      await hint(page, t, 'Help').click()
    },
  },

  // ------------------------------------------------------------------ Settings and areas
  {
    id: 'settings',
    collapsed: { controls: false },
    target: (page) => settingsCard(page),
    markers: [
      { locate: (p) => settingsCard(p).locator('.segmented').first(), at: 'l', dx: -14 },
      { locate: (p) => settingsCard(p).locator('.segmented').nth(1), at: 'l', dx: -14 },
      { locate: (p) => settingsCard(p).locator('.field__range').first(), at: 'l', dx: -14, dy: -18 },
      { locate: (p) => settingsCard(p).locator('.controls__settings .field').first(), at: 'tl' },
      { locate: (p) => settingsCard(p).locator('.controls__settings .field').nth(1), at: 'tl' },
      { locate: (p) => settingsCard(p).locator('.controls__settings .field').nth(2), at: 'tl' },
    ],
  },
  // Simplify areas is shown 2 above its setting (SIMPLIFY_ZERO): -4 reads -2, the finest (Pro); 5 reads 7.
  { id: 'simplify-low', settings: { simplify: -4 } },
  { id: 'simplify-high', settings: { simplify: 5 } },
  { id: 'colours-6', settings: { colours: 6 } },
  { id: 'geometric', settings: { geometric: true } },
  // A value study as chapter 08 describes it: one dark paint, a few mixes.
  {
    id: 'values',
    settings: { values: true, colours: 4 },
    prepare: async (page, { store, idle }) => {
      await store('paints', (s) => s.setEnabled(['schmincke-horadam-663']))
      await store('analysis', (s) => s.analyse())
      await idle()
    },
  },

  // ------------------------------------------------------------------ Views
  { id: 'view-target', settings: { view: 'target' } },
  { id: 'view-overlay', settings: { view: 'overlay' } },
  { id: 'view-photo', settings: { view: 'original' } },
  { id: 'view-template', settings: { view: 'template' } },
  { id: 'view-plain', settings: { outlines: false, numbers: false } },
  {
    id: 'picture-tools',
    target: (page) => page.locator('.painting__tools').first(),
    padding: 12,
    markers: [
      { locate: (p, t) => hint(p, t, 'Fit'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Detail'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Mixed paint'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Photo colour'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Overlay'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Photo'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Template to print'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Outlines'), at: 't' },
      { locate: (p, t) => hint(p, t, 'Numbers'), at: 't' },
    ],
  },

  // ------------------------------------------------------------------ Colours and recipes
  {
    id: 'colours',
    collapsed: { palette: false },
    target: (page) => coloursCard(page),
    markers: [
      { locate: (p) => coloursCard(p).locator('.palette__count').first(), at: 'l', dx: -18 },
      { locate: (p) => coloursCard(p).locator('.palette__key').first(), at: 'l', dx: -18 },
      { locate: (p) => coloursCard(p).locator('.palette__item').first(), at: 'l', dx: -4 },
    ],
  },
  {
    id: 'inspector',
    prepare: async (page) => {
      await tapPicture(page, 0.32, 0.62)
    },
    markers: [{ locate: (p) => p.locator('.inspector').first(), at: 'tl', dx: 14, dy: 14 }],
  },
  {
    id: 'breakdown',
    prepare: async (page, { t }) => {
      await tapPicture(page, 0.32, 0.62)
      await page.getByRole('button', { name: t('Full breakdown') }).click()
    },
    target: (page) => page.locator('.breakdown__body').first(),
  },
  {
    id: 'mix-selected',
    // As a click on a mix in the colour list does it: the second mix, its washes together.
    prepare: async (page, { store }) => {
      await store('analysis', (s) => {
        const family = s.entries.find((e) => e.family !== s.entries[0].family)?.family
        s.selectEntry(s.entries.findIndex((e) => e.family === family))
      })
    },
  },

  // ------------------------------------------------------------------ Paint box
  {
    id: 'paintbox',
    viewport: { width: 1440, height: 1100 },
    prepare: async (page, { t }) => {
      await hint(page, t, 'Paint box').click()
    },
    target: (page) => dialog(page),
  },
  {
    id: 'paintbox-add',
    viewport: { width: 1440, height: 1100 },
    prepare: async (page, { t }) => {
      await hint(page, t, 'Paint box').click()
      await page.locator('.paintbox__add').first().click()
      await page.locator('.colour-search__input').first().fill('ultramarine')
    },
    target: (page) => page.locator('.paintbox__adding').first(),
    padding: 24,
  },

  // ------------------------------------------------------------------ Layer mode
  {
    id: 'layers',
    mode: 'layer',
    collapsed: { palette: false },
  },
  {
    id: 'layer-solo',
    mode: 'layer',
    collapsed: { palette: false },
    prepare: async (page) => {
      await page.locator('.layers__item').first().click()
    },
  },
  {
    id: 'layer-step',
    mode: 'layer',
    prepare: async (page, { t }) => {
      await page.getByRole('button', { name: t('Paint step by step') }).click()
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: t('Next') }).click()
      await page.getByRole('button', { name: t('Next') }).click()
    },
  },

  // ------------------------------------------------------------------ Details, collection, print
  {
    id: 'closeup',
    prepare: async (page, { store, idle }) => {
      await store('analysis', (s) => s.addCloseup({ x: 0.18, y: 0.45, w: 0.32, h: 0.3 }))
      await idle()
    },
  },
  {
    id: 'collection',
    prepare: async (page, { t }) => {
      await hint(page, t, 'Save').click()
      await page.waitForTimeout(300)
      const save = page.locator('dialog[open] button[type="submit"], dialog[open] .button--secondary').first()
      if (await save.isVisible().catch(() => false)) await save.click()
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
      await hint(page, t, 'Collection').click()
    },
    target: (page) => dialog(page),
  },
  {
    id: 'print',
    viewport: { width: 1000, height: 1400 },
    prepare: async (page) => {
      await page.emulateMedia({ media: 'print' })
    },
  },
  {
    id: 'preferences',
    sample: null,
    prepare: async (page, { t }) => {
      await hint(page, t, 'Preferences').click()
    },
    target: (page) => dialog(page),
  },
]
