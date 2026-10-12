// The icons of the interface: every SVG file in resources/icons, by its file name in lower case
// with hyphens ("Brick Wall.svg" is "brick-wall"). The files are read when the app is built, so
// their code is part of the page and no icon is requested on its own.
//
// An icon file is one path on a square of 72 units, as exported; only the path is kept, so an
// icon takes the colour of the text around it instead of the one in the file.

const files = import.meta.glob('../../resources/icons/*.svg', { query: '?raw', import: 'default', eager: true })

export const ICON_BOX = '0 0 72 72'

/** name -> the `d` of the path(s) of that icon */
export const icons = Object.fromEntries(
  Object.entries(files).map(([file, svg]) => [
    file.split('/').pop().replace(/\.svg$/, '').trim().toLowerCase().replace(/\s+/g, '-'),
    [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1].trim()),
  ]),
)
