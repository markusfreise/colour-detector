"""Rembrandt Watercolour (Royal Talens): reads the official colour chart in English and its Dutch,
German, French and Spanish editions and writes src/data/rembrandt-catalogue.js. See
tools/charts/README.md for the files and tools it needs.

    python3 -I tools/charts/rembrandt.py <folder with chart-en.pdf, chart-nl.pdf, chart-de.pdf, chart-fr.pdf, chart-es.pdf> > src/data/rembrandt-catalogue.js
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
DPI = 300  # the swatches are images of about 150 ppi
k = DPI / 72  # points to pixels
LANGUAGES = ['nl', 'de', 'fr', 'es']
# Half the distance between two columns of the chart (52.4 pt).
HALF = 24


def read_words(pdf):
    out = subprocess.run(['pdftotext', '-bbox', pdf, '-'], check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(e), html.unescape(t)) for a, b, c, e, t in re.findall(
        r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', out)]


def cells(words):
    """Each colour as its line '+++ 108 [opacity] 1 [G]': the number, the middle of that line, its
    top and bottom and the word that is the opacity sign (glyphs of Talens' own font, whose codes
    do not tell the signs apart, so the sign is read from the picture)."""
    # The legend below the chart, with its example of a colour, starts with the first '='.
    legend = min(w[1] for w in words if w[4] == '=') - 15
    found = []
    for i, (x0, y0, x1, y1, text) in enumerate(words):
        m = re.fullmatch(r'\+*(\d{3})', text)
        if not m or y0 >= legend:
            continue
        line = [w for w in words if abs(w[1] - y0) < 1.5 and abs((w[0] + w[2]) / 2 - (x0 + x1) / 2) < HALF]
        if not any(w[4].startswith('+') for w in line):
            continue
        sign = next(w for w in line if not re.search(r'\w', w[4]) and w[0] >= x1 - 0.5)
        cx = (min(w[0] for w in line) + max(w[2] for w in line)) / 2
        found.append({'number': m.group(1), 'cx': cx, 'top': y0, 'bottom': y1, 'sign': sign})
    return found


def near(words, cx, y0, y1):
    ws = [w for w in words if y0 <= (w[1] + w[3]) / 2 <= y1 and abs((w[0] + w[2]) / 2 - cx) <= HALF]
    return ' '.join(w[4] for w in sorted(ws, key=lambda w: w[0]) if re.search(r'\w', w[4]))


def names(pdf):
    """Number to name on one edition of the chart: the line above the swatch."""
    words = read_words(pdf)
    return {c['number']: near(words, c['cx'], c['top'] - 30, c['top'] - 19) for c in cells(words)}


subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-singlefile', f'{folder}/chart-en.pdf', f'{folder}/chart-en'], check=True)
img = np.asarray(Image.open(f'{folder}/chart-en.png').convert('RGB'))


def px(x, y):
    return int(round(x * k)), int(round(y * k))


def opacity(sign):
    """The square after the number: empty = transparent, crossed by a diagonal = semi-transparent,
    half filled = semi-opaque, filled = opaque."""
    a, b = px(sign[0], sign[1])
    c, e = px(sign[2], sign[3])
    ink = img[b:e, a:c].astype(int).sum(axis=2) < 300
    cols, rows = np.where(ink.any(axis=0))[0], np.where(ink.any(axis=1))[0]
    square = ink[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    h, w = square.shape
    fill = square[h // 5: h - h // 5, w // 5: w - w // 5].mean()
    return 'O' if fill > 0.85 else 'SO' if fill > 0.35 else 'ST' if fill > 0.05 else 'T'


def swatch(cx, number_top):
    """The painted rectangle between the name and the number line, a flat swatch of the paint
    in a strong wash. Returns the median of its inner part (12 % in from each edge, clear of the
    cut edges) and the hue shift between its darker and lighter half, or (None, None) for an
    empty box (the whites)."""
    a, b = px(cx - HALF, number_top - 21)
    c, e = px(cx + HALF, number_top - 0.5)
    region = img[b:e, a:c]
    painted = region.min(axis=2) < 235
    rows, cols = np.where(painted.mean(axis=1) > 0.6)[0], np.where(painted.mean(axis=0) > 0.6)[0]
    if len(rows) < 50 or len(cols) < 100:
        return None, None
    top, bottom, left, right = rows[0], rows[-1], cols[0], cols[-1]
    dy, dx = int((bottom - top) * 0.12), int((right - left) * 0.12)
    inner = region[top + dy: bottom - dy, left + dx: right - dx].reshape(-1, 3).astype(float)
    luma = inner @ [0.299, 0.587, 0.114]
    mid = np.median(luma)
    dark, light = np.median(inner[luma <= mid], axis=0), np.median(inner[luma > mid], axis=0)
    median = np.median(inner, axis=0)
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in median), hue_shift(dark, light)


words = read_words(f'{folder}/chart-en.pdf')
translations = {lang: names(f'{folder}/chart-{lang}.pdf') for lang in LANGUAGES}
colours = []
for cell in cells(words):
    cx, number = cell['cx'], cell['number']
    name = near(words, cx, cell['top'] - 30, cell['top'] - 19)
    pigment_text = near(words, cx, cell['bottom'] - 1, cell['bottom'] + 7)
    # The chart writes PO48 twice as "P048", with a zero; no Colour Index name starts with P0.
    pigments = [re.sub(r'^P0', 'PO', p.strip()) for p in pigment_text.split('/') if p.strip()]
    pigments = [p for p in pigments if re.fullmatch(r'P(Y|O|R|V|B|G|Br|Bk|W|M)\d+(:\d+)?', p)]
    colour = {'number': number, 'name': name}
    others = {lang: translations[lang][number] for lang in LANGUAGES if translations[lang].get(number)}
    if others:
        colour['names'] = others
    hex_value, shift = swatch(cx, cell['top'])
    if hex_value is None:
        # The whites are drawn as empty boxes, as white as in the other libraries.
        hex_value = '#ffffff'
    colour.update({'hex': hex_value, 'pigments': pigments, 'transparency': opacity(cell['sign'])})
    # Metallic, interference, chameleon and glitter colours ("Coated Mica", "Coated Glass" on the
    # chart) change with the light and the ground; a printed swatch says nothing of the paint.
    if 'Coated' in pigment_text:
        kind = ('glitter' if name.startswith('Spark') else 'chameleon' if name.startswith('Cham')
                else 'interference' if name.startswith('Interference') else 'metallic')
        colour['hex'] = None
        colour['unverified'] = f'A {kind} colour ({pigment_text.lower()}), which a printed swatch does not show.'
    elif shift is not None and shift > 25:
        colour['hex'] = None
        colour['unverified'] = f'The swatch on the chart is mottled in two hues {shift} degrees apart.'
    colours.append(colour)

counts = {t: sum(c['transparency'] == t for c in colours) for t in ('T', 'ST', 'SO', 'O')}
print(f'{len(colours)} colours, {len({c["number"] for c in colours})} numbers, transparency {counts}', file=sys.stderr)
for lang in LANGUAGES:
    missing = sorted({c['number'] for c in colours} ^ set(translations[lang]))
    if missing:
        print(f'{lang}: numbers not on both charts: {missing}', file=sys.stderr)

print(js_catalogue('rembrandtCatalogue', colours, """\
// Rembrandt Watercolour (Royal Talens), 120 colours: numbers, names, pigments and the opacity sign
// from the official colour chart (royaltalens.com/pages/rembrandt-colour-chart, "Rembrandt water
// colour ENG.pdf", layout of 28 May 2019, file of 1 June 2021), the Dutch, German, French and
// Spanish names from the same chart in those languages (linked from the page in each language).
// Its 120 numbers are the colours of the tubes in Royal Talens' shop. Colours: the median of each
// flat swatch of the chart, 12 % in from its edges, the whites (empty boxes) as white; the
// metallic, interference, chameleon and glitter colours and a swatch mottled in two hues more than
// 25 degrees apart have none (`unverified`). Written by tools/charts/rembrandt.py."""))
