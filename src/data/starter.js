// The Starter box of the free version: twelve colours as a cheap student set has them, no brand.
// Two yellows, two reds and two blues mix almost every hue; the earths give skin, wood and stone,
// ultramarine with burnt sienna the greys. No white: in watercolour the paper is the white.
// The colours are estimates of such a set at strength 1 (source 'estimate'); they are to be
// replaced by swatches of a real set (source 'swatch').
const paint = (number, name, nameDe, hex) => ({
  id: `starter-${number}`,
  vendor: 'Starter box',
  line: '',
  number,
  name,
  nameDe,
  hex,
  forms: ['half pan'],
  source: 'estimate',
  starter: true,
})

export const STARTER_BOX_NAME = 'Starter box'

export const starterPaints = [
  paint('1', 'Lemon yellow', 'Zitronengelb', '#f2e23a'),
  paint('2', 'Medium yellow', 'Mittelgelb', '#f6bf22'),
  paint('3', 'Vermilion', 'Zinnoberrot', '#e04a30'),
  paint('4', 'Carmine', 'Karmin', '#b5203f'),
  paint('5', 'Violet', 'Violett', '#6a3a8a'),
  paint('6', 'Ultramarine', 'Ultramarinblau', '#2f4aa6'),
  paint('7', 'Prussian blue', 'Preußischblau', '#1f4d6c'),
  paint('8', 'Sap green', 'Saftgrün', '#5e892f'),
  paint('9', 'Yellow ochre', 'Ocker', '#c6993c'),
  paint('10', 'Burnt sienna', 'Gebrannte Siena', '#a1522c'),
  paint('11', 'Burnt umber', 'Gebrannte Umbra', '#6a4a32'),
  paint('12', 'Black', 'Schwarz', '#38383a'),
]
