"""LUKAS Aquarell 1862: reads the official colour chart and writes src/data/lukas-catalogue.js.
See tools/charts/README.md for the file and tools it needs.

    python3 -I tools/charts/lukas.py <folder with chart.pdf> > src/data/lukas-catalogue.js
"""
import html
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import hue_shift, js_catalogue  # noqa: E402

folder = sys.argv[1]
DPI = 600
k = DPI / 72  # points to pixels

subprocess.run(['pdftotext', '-bbox', f'{folder}/chart.pdf', f'{folder}/chart-bbox.html'], check=True)
subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-singlefile', f'{folder}/chart.pdf', f'{folder}/chart'], check=True)

words = [(float(a), float(b), float(c), float(e), html.unescape(t)) for a, b, c, e, t in re.findall(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(f'{folder}/chart-bbox.html').read())]
Image.MAX_IMAGE_PIXELS = None
img = np.asarray(Image.open(f'{folder}/chart.png').convert('RGB'))  # uint8; crops are cast where needed


def px(x, y):
    return int(round(x * k)), int(round(y * k))


def crop(x0, y0, x1, y1):
    a, b = px(x0, y0)
    c, e = px(x1, y1)
    return img[b:e, a:c].astype(int)


def line(x, y0, y1):
    """The words of one line of an entry: right of the number column, left of the next swatch."""
    ws = [w for w in words if y0 <= (w[1] + w[3]) / 2 <= y1 and x + 20 <= w[0] < x + 118]
    return ' '.join(w[4] for w in sorted(ws, key=lambda w: w[0]))


def opacity(x, y):
    """The square under the stars: empty = transparent, a diagonal line = semi-transparent,
    half filled along the diagonal = semi-opaque, filled = opaque."""
    ink = crop(x - 0.5, y + 19, x + 6.5, y + 28).sum(axis=2) < 300
    cols, rows = np.where(ink.any(axis=0))[0], np.where(ink.any(axis=1))[0]
    square = ink[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    h, w = square.shape
    fill = square[h // 6: h - h // 6, w // 6: w - w // 6].mean()
    return 'O' if fill > 0.85 else 'SO' if fill > 0.3 else 'ST' if fill > 0.03 else 'T'


def swatch(x, y):
    """The swatch left of the number, one even wash of the paint at full strength (not a
    gradient). Returns the median of its inner part, 4 pt in from the edges, and the largest
    hue shift between its top and bottom thirds and its left and right halves."""
    region = crop(x - 51, y + 1, x - 8, y + 32)
    h, w = region.shape[:2]
    median = lambda r: np.median(r.reshape(-1, 3), axis=0)
    shift = max(hue_shift(median(region[: h // 3]), median(region[-h // 3:])),
                hue_shift(median(region[:, : w // 2]), median(region[:, w // 2:])))
    return '#%02x%02x%02x' % tuple(int(v) for v in median(region)), shift


colours = []
# Four columns, read top to bottom; the numbers are the only four-digit words in the small type
# (the large "1862" of the title is not one).
for x0, y0, x1, y1, text in sorted(words, key=lambda w: (round(w[0] / 50), w[1])):
    if not (re.fullmatch(r'1\d{3}', text) and y1 - y0 < 10):
        continue
    name = line(x0, y0 - 1, y1 + 1)
    english = line(x0, y0 + 8, y0 + 17)
    pigment_text = line(x0, y0 + 17, y0 + 25)
    # The chart once prints "PBR24" for PBr24.
    pigments = [p.strip().replace('PBR', 'PBr').replace('PBK', 'PBk') for p in pigment_text.split(',') if p.strip()]
    # "Strontiumphosphate" (cobalt violet) and "Perlglanzpigment" (gold) are no Colour Index names.
    pigments = [p for p in pigments if re.fullmatch(r'P(Y|O|R|V|B|G|Br|Bk|W|M)\d+(:\d+)?', p)]
    hex_value, shift = swatch(x0, y0)
    colour = {'number': text, 'name': name, 'names': {'en': english}, 'hex': hex_value,
              'pigments': pigments, 'transparency': opacity(x0, y0)}
    if not pigments:
        print(f'{text} {name}: no Colour Index name in "{pigment_text}"', file=sys.stderr)
    if name.endswith('Weiß'):
        # The whites, as in the other libraries.
        colour['hex'] = '#ffffff'
    elif 'Perlglanzpigment' in pigment_text:
        colour['hex'] = None
        colour['unverified'] = 'A pearlescent (metallic) paint: a printed swatch does not show its colour.'
    elif shift > 25:
        colour['hex'] = None
        colour['unverified'] = f'The swatch on the chart changes hue by {shift} degrees across it.'
    colours.append(colour)

numbers = [c['number'] for c in colours]
print(f'{len(colours)} colours, {len(set(numbers))} numbers', file=sys.stderr)

print(js_catalogue('lukasCatalogue', colours, """\
// LUKAS Aquarell 1862 (Dr. Fr. Schoenfeld, Duesseldorf), 70 colours: numbers, German and English
// names, pigments and the opacity symbol from the official colour chart (lukas.eu, linked from the
// product page "LUKAS 1862 Watercolor 24ml" and listed under Download Resources > Colour Charts:
// https://lukas-1f093.kxcdn.com/wp-content/uploads/2025/07/LUKAS-1862-Aquarell-Colour-Chart-DE-EN.pdf,
// chart made 2020-10-16, uploaded 2025-07-23, downloaded 2026-10-17). Colours: each swatch of the
// chart is one even wash of the paint at full strength, rendered at 600 dpi by pdftoppm; the colour is
// the median of its inner part (4 pt in from the edges), the whites as white. A swatch whose hue
// differs by more than 25 degrees between its top and bottom thirds or its left and right halves,
// and the pearlescent Gold, have none (`unverified`). Written by tools/charts/lukas.py."""))
