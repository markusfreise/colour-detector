// Sample pictures, offered in the sample library (SampleDialog.vue); the first one loads at start.
// All are under the Unsplash License, no longer than 1024 px. `credit` names the photographer and
// links to the photo, or to the profile until the photo is up there.
const MARKUS = { name: 'Markus Freise', url: 'https://unsplash.com/@markusfreise' }
export const SAMPLE_FILES = [
  { file: 'sample-bielefeld.webp', name: 'Bielefeld', credit: MARKUS },
  { file: 'sample-llyn-idwal.webp', name: 'Llyn Idwal', credit: MARKUS },
  { file: 'sample-rooftops-dusk.webp', name: 'Rooftops at dusk', credit: MARKUS },
  { file: 'sample-winter-fields.webp', name: 'Winter fields', credit: MARKUS },
  { file: 'sample-old-town-snow.webp', name: 'Old town in snow', credit: MARKUS },
  {
    file: 'sample-red-train.webp',
    name: 'Red train',
    credit: { name: 'Markus Freise', url: 'https://unsplash.com/photos/red-and-white-train-on-train-station-Zi8T2OwJf44' },
  },
  {
    file: 'sample-woman-white-wall.webp',
    name: 'Woman by a white wall',
    credit: { name: 'Ayo Ogunseinde', url: 'https://unsplash.com/photos/woman-looking-sideways-leaning-on-white-wall-6W4F62sN_yI' },
  },
]

// As the app offers them: where the picture is, and whether it lives only in this checkout.
export const SAMPLES = SAMPLE_FILES.map((sample) => ({ ...sample, url: `${import.meta.env?.BASE_URL ?? '/'}${sample.file}`, local: false }))
// Pictures in `local-samples/` exist only in this checkout: the folder is not in the repo, and the
// list is filled by the dev server only (vite.config.js). "white-dress.webp" → "White dress".
for (const file of typeof __LOCAL_SAMPLES__ === 'undefined' ? [] : __LOCAL_SAMPLES__) {
  const title = file.replace(/\.\w+$/, '').replace(/-/g, ' ')
  SAMPLES.push({ url: `${import.meta.env.BASE_URL}local-samples/${file}`, name: `${title[0].toUpperCase()}${title.slice(1)}`, local: true })
}

