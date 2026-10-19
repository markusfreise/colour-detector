"""Sennelier L'Aquarelle: reads the official colour chart and the list of granulating colours and
writes src/data/sennelier-catalogue.js. See tools/charts/README.md for the files and tools it needs.

    python3 -I tools/charts/sennelier.py <folder with chart.pdf and granlist.pdf> > src/data/sennelier-catalogue.js
"""
import html
import json
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
granulating_text = subprocess.run(['pdftotext', '-layout', f'{folder}/granlist.pdf', '-'], check=True, capture_output=True, text=True).stdout

words = [(float(a), float(b), float(c), float(e), html.unescape(t)) for a, b, c, e, t in re.findall(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(f'{folder}/chart-bbox.html').read())]
img = np.asarray(Image.open(f'{folder}/chart.png').convert('RGB'))


def px(x, y):
    return int(round(x * k)), int(round(y * k))


def near(cx, y0, y1, dx):
    return [w for w in words if y0 <= (w[1] + w[3]) / 2 <= y1 and abs((w[0] + w[2]) / 2 - cx) <= dx]


def lines(ws):
    rows = {}
    for w in sorted(ws, key=lambda w: (round(w[1]), w[0])):
        rows.setdefault(round(w[1]), []).append(w)
    return [sorted(v, key=lambda w: w[0]) for _, v in sorted(rows.items())]


# The list of the 36 granulating colours (2022) has the French names and an opacity of its own,
# which is taken over the chart's symbol where they differ (it is ten years newer).
granulating = {}
for line in granulating_text.splitlines():
    m = re.match(r'\s*(.+?)\s{2,}(.+?)\s{2,}(\d{3})\s+S\d\s+.+?\s{2,}(O/T|O|T)\s+\S+\s*$', line)
    if m:
        granulating[m.group(3)] = {'fr': m.group(1).strip(), 'transparency': {'O': 'O', 'T': 'T', 'O/T': 'SO'}[m.group(4)]}


def opacity(x0, x1, y0, y1):
    """The square after the series: filled = opaque, empty = transparent, half = semi-opaque."""
    a, b = px(x0, y0)
    c, e = px(x1, y1)
    ink = img[b:e, a:c].astype(int).sum(axis=2) < 300
    cols, rows = np.where(ink.any(axis=0))[0], np.where(ink.any(axis=1))[0]
    square = ink[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    h, w = square.shape
    fill = square[h // 4: h - h // 4, w // 4: w - w // 4].mean()
    return 'O' if fill > 0.85 else 'T' if fill < 0.15 else 'SO'


def swatch(cx, name_top):
    """The hexagon above the name, painted as a gradient from strong (top) to pale (bottom).
    Returns the median of the band 20 to 40 % down and the hue shift to the band 55 to 75 % down,
    or (None, None) for a swatch too pale to find (the whites)."""
    a, b = px(cx - 14, name_top - 62)
    c, e = px(cx + 14, name_top - 1)
    region = img[b:e, a:c].astype(int)
    # Painted: neither the white page nor the light grey hexagons of the pattern.
    blank = (np.abs(region - 244).max(axis=2) <= 6) | (region.min(axis=2) >= 250)
    # The hexagons have flat tops, so their rows are painted right across; lines of text are not.
    full = np.where((~blank).mean(axis=1) > 0.9)[0]
    if len(full) < 100:
        return None, None
    breaks = np.where(np.diff(full) > 3)[0]
    block = full[breaks[-1] + 1:] if len(breaks) else full
    top, height = block[0], block[-1] - block[0]
    band = lambda f0, f1: np.median(region[top + int(height * f0): top + int(height * f1)].reshape(-1, 3), axis=0)
    strong, pale = band(0.2, 0.4), band(0.55, 0.75)
    return '#%02x%02x%02x' % tuple(int(v) for v in strong), hue_shift(strong, pale)


colours = []
for x0, y0, x1, y1, text in words:
    # The numbers are the only three-digit words in the large type.
    if not (re.fullmatch(r'\d{3}', text) and y1 - y0 > 9):
        continue
    cx = (x0 + x1) / 2
    name = ' '.join(w[4] for w in sorted(near(cx, y0 - 9, y0 + 1, dx=40), key=lambda w: w[0]))
    below = lines(near(cx, y1 - 3, y1 + 30, dx=36))
    serie_line = next(l for l in below if any(w[4] == 'serie' for w in l))
    at = [w[4] for w in serie_line].index('serie')
    series_word, rest = serie_line[at + 1], serie_line[at + 2:]
    transparency = opacity(series_word[2] + 0.3, rest[0][0] - 0.3 if rest else series_word[2] + 12, series_word[1], series_word[3])
    after = [l for l in below if l[0][1] > serie_line[0][1] + 1]
    pigment_line = next((l for l in after if not {w[4] for w in l} <= {'***', '**', '*'}), [])
    pigments = [p.replace(' ', '') for p in re.split(r',\s*', ' '.join(w[4] for w in pigment_line)) if p]
    # "nr" (not listed) and "fluo" are no Colour Index names.
    pigments = [p for p in pigments if re.fullmatch(r'P[A-Z][a-z]?\d+(:\d+)?', p)]
    hex_value, shift = swatch(cx, y0 - 9)
    colour = {'number': text, 'name': name}
    if text in granulating:
        colour['names'] = {'fr': granulating[text]['fr']}
        transparency = granulating[text]['transparency']
    if hex_value is None:
        # The whites, as in the other libraries.
        hex_value = '#ffffff'
    colour.update({'hex': hex_value, 'pigments': pigments, 'transparency': transparency})
    # A single paint keeps its hue as it is thinned; where the drawn gradient turns, the chart
    # does not say which colour the paint is.
    if shift is not None and shift > 25:
        colour['hex'] = None
        colour['unverified'] = f'The swatch on the chart changes hue by {shift} degrees from strong to pale.'
    colours.append(colour)

print(f'{len(colours)} colours, {len(granulating)} in the list of granulating colours', file=sys.stderr)
missing = sorted(set(granulating) - {c['number'] for c in colours})
if missing:
    print(f'granulating colours not on the chart: {missing}', file=sys.stderr)

print(js_catalogue('sennelierCatalogue', colours, """\
// Sennelier L'Aquarelle (French Artists' Watercolour), 98 colours: numbers, names, pigments and the
// transparency symbol from the official colour chart (sennelier-colors.com, ColorChart-ENG-WATERCOLOR.pdf,
// 2012), the French names and the transparency of the 36 granulating colours from Sennelier's list of
// them (LIST_SENNELIER_ARTIST_WATERCOLOR_GRANULATING_COLORS.pdf, 2022, which counts 110 colours: the
// 12 added since 2012 are on no public chart). Colours: the median of the band 20 to 40 % down each
// swatch of the chart, the whites as white; a swatch whose hue turns from strong to pale has none
// (`unverified`). Written by tools/charts/sennelier.py."""))
