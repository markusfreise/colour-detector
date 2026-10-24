# Reading the makers' colour charts

The scripts here read a paint maker's official colour chart and write its catalogue file in
`src/data/`. Only the makers' own publications are used, never data of other apps or shops.
The downloads are not kept in the repo: fetch them again from the addresses below.

Tools (not dependencies of the app): Python 3 with Pillow and NumPy, and poppler-utils
(`pdftotext`, `pdftoppm`). On Debian: `apt install python3-pil python3-numpy poppler-utils`.

After writing a catalogue: `npm run app:data`, `npm run libraries`, `npm test`.

## Colour values

No maker publishes colour values. As for the libraries before (Horadam, Winsor & Newton,
Michael Harding), each colour is measured on the maker's chart: the strong end of the swatch,
standing for the paint at its strongest wash (the `hex` of the app). A swatch that does not give a
reliable colour gets `hex: null` and the reason in `unverified`; it is listed in
`docs/libraries.md`.

## Schmincke Horadam Aquarell (`horadam.py`)

Into one folder:

- `en.html`: https://www.schmincke.de/en/produkte/aquarell/horadam-aquarell (the page as served)
- `de.html`: https://www.schmincke.de/produkte/aquarell/horadam-aquarell
- `swatches/14NNN.jpg`: the swatch of every card, `https://www.schmincke.de/fileadmin/schmincke_products/farbwischer/14NNN.jpg`
  (the page names them: `grep -o 'farbwischer/14[0-9]*\.jpg' en.html`)

Then `python3 -I tools/charts/horadam.py <folder> > /tmp/horadam.js` and move that file to
`src/data/horadam-catalogue.js`, and `python3 -I tools/charts/horadam.py <folder> supergranulation > /tmp/horadam.js`
moved to `src/data/horadam-supergranulation-catalogue.js` (not straight into them: the script reads
the colours it keeps from there). The supergranulating colours (`data-supergranulation="1"`) are a
library of their own, "Schmincke Horadam Supergranulation", as they are a series of their own.

Every colour has a card with data attributes: the title (English or German by page), the pigments
and the opacity (L, HL, HD, D: transparent to opaque). The page has one card that is no colour,
031 "ONETZ", without pigments or opacity; it is left out. Colours: the values the catalogue had,
measured on the printed chart, stay. A colour new to it is measured on its swatch: a wash from strong
to pale like the chart, the median of the band 20 to 40 % down (on the colours of before that band
is within ΔE 1.7 of their values, median); a brush stroke on white (the 50 supergranulating
colours), the median of the darker half of the paint. Their pigments part on the paper, so one
value only stands for them.

## Sennelier L'Aquarelle (`sennelier.py`)

Into one folder:

- `chart.pdf`: the colour chart, sennelier-colors.com, page "L'Aquarelle" (Aquarelle-petite-aquarelle_85),
  link to `/article/photo/dossier494/ColorChart-ENG-WATERCOLOR.pdf`
- `granlist.pdf`: the list of granulating colours, same page, link to
  `/article/photo/dossier534/LIST_SENNELIER_ARTIST_WATERCOLOR_GRANULATING_COLORS.pdf`

Then `python3 -I tools/charts/sennelier.py <folder> > src/data/sennelier-catalogue.js`.

The swatches are hexagons painted as a gradient; the colour is the median of the band 20 to 40 %
down. The very top of some swatches turns darker and changes hue; where the hue between that band
and the pale one (55 to 75 %) differs by more than 25 degrees (a single paint thinned keeps its
hue within about 18), the colour is unverified. Transparency: the square after the series
(filled, half, empty), overruled by the newer list of granulating colours where both have it.
