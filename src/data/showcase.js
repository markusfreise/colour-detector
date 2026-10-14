// The three paints of the picture behind signing in: a yellow, a magenta and a cyan with the
// colours of Schmincke Horadam 208, 367 and 483, under made-up numbers and names. They are no
// paints of anybody's box and are never saved.
const paint = (number, name, hex) => ({
  id: `showcase-${number}`,
  vendor: 'Watercolourlove',
  line: 'Showcase',
  number,
  name,
  hex,
  forms: ['whole pan'],
  source: 'showcase',
})

export const showcasePaints = [
  paint('112', 'Lantern yellow', '#fae409'),
  paint('377', 'Orchid magenta', '#dc4a95'),
  paint('466', 'Lagoon cyan', '#1392cf'),
]
