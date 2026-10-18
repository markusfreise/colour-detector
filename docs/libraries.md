# Paint libraries

The colour charts that come with the app (`src/data/libraries.js`): the common colours for everybody,
the makers' charts with Pro. Written by
`npm run libraries` from the data: do not edit by hand. How each chart was read is in the
header of its catalogue file and, for the newer ones, in `tools/charts/`.

| Library | Colours | With a colour | Pigments | Transparency | Source |
|---|---|---|---|---|---|
| Common colours | 40 | 40 | 40 | 0 | The colours most makers have, by their usual name and pigment; each shown as one of the maker charts below shows it (src/data/common-catalogue.js) |
| Schmincke Horadam | 140 | 140 | 0 | 0 | Official Schmincke Horadam colour chart |
| Winsor & Newton Professional | 116 | 116 | 0 | 0 | Official Winsor & Newton Professional Watercolour colour chart (colart.s3.amazonaws.com, 2026) |
| Michael Harding | 136 | 136 | 0 | 0 | michaelharding.co.uk/watercolours (2026-10-15) |
| Sennelier L'Aquarelle | 98 | 97 | 97 | 98 | Sennelier colour chart ColorChart-ENG-WATERCOLOR.pdf (2012) and list of granulating colours (2022), both linked from sennelier-colors.com, L'Aquarelle page |

## Not in the charts

- Sennelier L'Aquarelle: Sennelier counts 110 colours (2022); the 12 added since the chart of 2012 are on no public chart of theirs.

## Unverified colours

Their number fills in the name; the colour is set by hand.

- Sennelier L'Aquarelle 917 Dioxazine Purple: The swatch on the chart changes hue by 34 degrees from strong to pale.
