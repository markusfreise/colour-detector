"""Holbein Artists' Watercolor: reads the official colour chart, the technical data sheet and the
safety data sheet and writes src/data/holbein-catalogue.js. See tools/charts/README.md for the files
and tools it needs.

    python3 -I tools/charts/holbein.py <folder with chart.pdf, tds.pdf and sds.pdf> > src/data/holbein-catalogue.js
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
# The swatches are photographs embedded at about 210 dpi; 300 is enough and keeps the page
# (1920 x 1080 points) at 8000 x 4500 pixels.
DPI = 300
k = DPI / 72  # points to pixels
Image.MAX_IMAGE_PIXELS = None

subprocess.run(['pdftotext', '-bbox', f'{folder}/chart.pdf', f'{folder}/chart-bbox.html'], check=True)
subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-singlefile', f'{folder}/chart.pdf', f'{folder}/chart'], check=True)
tds_text = subprocess.run(['pdftotext', '-layout', f'{folder}/tds.pdf', '-'], check=True, capture_output=True, text=True).stdout
sds_text = subprocess.run(['pdftotext', '-layout', f'{folder}/sds.pdf', '-'], check=True, capture_output=True, text=True).stdout

words = [(float(a), float(b), float(c), float(e), html.unescape(t)) for a, b, c, e, t in re.findall(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(f'{folder}/chart-bbox.html').read())]
img = np.asarray(Image.open(f'{folder}/chart.png').convert('RGB'))

PIGMENT = r'P(?:Y|O|R|V|B|G|Br|Bk|W|M)\d+(?::\d+)?'

# The technical data sheet: one row per colour, "W039, 239  Aureolin  <chemical name>  <series>
# <rating>  <C.I. numbers>  <C.I. names>". The C.I. names stand on the line of the number even
# where the chemical name runs over several lines; the chemical name tells the fluorescent and
# the mica (metallic) colours.
tds = {}
for line in tds_text.splitlines():
    m = re.match(r'\s*(W\d{3}),\s*\d{3}\s+(.+?)\s{2,}', line)
    if not m:
        continue
    tds[m.group(1)] = {
        'name': m.group(2).strip(),
        'pigments': re.findall(rf'\b{PIGMENT}\b', line),
        'fluorescent': 'Fluorescent' in line,
        'metallic': 'Mica' in line,
    }


def title(text):
    """The chart prints the English names in capitals; written as Holbein writes them elsewhere."""
    out = []
    for word in text.replace('’', "'").split():
        w = word.lower()
        out.append(w if w == 'of' else w[:1].upper() + w[1:])
    return ' '.join(out)


def column_lines(n):
    """The lines under a number in its column: English name, French name, the code of ratings."""
    ws = [w for w in words if n[0] - 1 <= w[0] <= n[0] + 118 and n[3] < (w[1] + w[3]) / 2 <= n[3] + 40]
    rows = []
    for w in sorted(ws, key=lambda w: (w[1] + w[3]) / 2):
        mid = (w[1] + w[3]) / 2
        if rows and abs(mid - rows[-1][0]) < 3:
            rows[-1][1].append(w)
        else:
            rows.append([mid, [w]])
    return [' '.join(w[4] for w in sorted(r[1], key=lambda w: w[0])) for r in rows]


def swatch(n):
    """The swatch above the number: a painted strip, strong at the left and thinned to the right,
    98 points wide from the left edge of the number and ending 1 to 3.5 points above it. Returns
    the median of the band 20 to 40 % across (rows from 8 to 24 points above the number, inside
    the strip) and the hue shift to the band 55 to 75 % across."""
    x0, y = n[0], n[1]
    region = img[int((y - 24) * k): int((y - 8) * k), int(x0 * k): int((x0 + 98) * k)]
    width = region.shape[1]
    band = lambda f0, f1: np.median(region[:, int(width * f0): int(width * f1)].reshape(-1, 3).astype(int), axis=0)
    strong, pale = band(0.2, 0.4), band(0.55, 0.75)
    return '#%02x%02x%02x' % tuple(int(v) for v in strong), hue_shift(strong, pale)


colours = []
# The 5 ml numbers (W001 to W191) open each entry; the 15 ml number (W201 to W391) follows.
for n in sorted((w for w in words if re.fullmatch(r'W[01]\d\d', w[4])), key=lambda w: (round(w[0] / 50), w[1])):
    english, french, code = column_lines(n)[:3]
    # "*** TNI": permanency, then T transparent, B semi-transparent, O opaque (and the letters
    # for staining, lifting, granulating and intense).
    letters = re.match(r'\*+\s*([A-Z]+)', code).group(1)
    opacity = [{'T': 'T', 'B': 'ST', 'O': 'O'}[c] for c in letters if c in 'TBO']
    number = n[4]
    data = tds.get(number)
    colour = {'number': number, 'name': title(english), 'names': {'fr': french.replace('’', "'")}}
    hex_value, shift = swatch(n)
    if re.search(r'WHITE', english):
        # The whites, as in the other libraries.
        hex_value, shift = '#ffffff', 0
    colour['hex'] = hex_value
    colour['pigments'] = data['pigments'] if data else []
    if len(opacity) == 1:
        colour['transparency'] = opacity[0]
    reason = None
    if data and data['metallic']:
        reason = 'A metallic colour (mica); the chart swatch does not show its colour.'
    elif data and data['fluorescent']:
        reason = 'A fluorescent colour; the printed chart cannot show it.'
    elif shift > 25:
        # A single paint keeps its hue as it is thinned; where the swatch turns, the chart does
        # not say which colour the paint is.
        reason = f'The swatch on the chart changes hue by {shift} degrees from strong to pale.'
    if reason:
        colour['hex'] = None
        colour['unverified'] = reason
    colours.append(colour)
    if not data:
        print(f'{number} {english}: not in the technical data sheet', file=sys.stderr)

print(f'{len(colours)} colours, {len(tds)} rows in the technical data sheet', file=sys.stderr)

# The safety data sheet of 2025 lists the names of the range in its appendix (the first table,
# before the Luminous, Iridescent and Nightfall lines). Names it has and the chart has not are
# reported, so a colour added since 2018 shows up.
appendix = sds_text.split('COLOR INFORMATION', 1)[1].split('Luminous Blue', 1)[0]
sds_names = set()
for line in appendix.splitlines():
    for name in re.findall(r"([A-Z][A-Za-z'#0-9 ()]+?)\s+(?:－|Cd|Co|Cu)\s+", line):
        sds_names.add(re.sub(r'\s*\(.*?\)', '', name).strip().lower())
chart_names = {c['name'].lower() for c in colours} | {re.sub(r'\s*\(.*?\)', '', tds[c['number']]['name']).lower() for c in colours if c['number'] in tds}
print(f'{len(sds_names)} names in the safety data sheet; not on the chart: {sorted(sds_names - chart_names)}', file=sys.stderr)

print(js_catalogue('holbeinCatalogue', colours, """\
// Holbein Artists' Watercolor (HWC, Holbein Works, Japan), 108 colours: 5 ml numbers, names, French
// names and the opacity letter (T transparent, B semi-transparent, O opaque) from the official
// digital colour chart (HK Holbein, holbeinartistmaterials.com, "Artists' Watercolor" page:
// https://www.holbeinartistmaterials.com/wp-content/uploads/2020/12/HWC.pdf, (c) 2018, made
// 2018-12-06), the pigments from the technical data sheet
// (https://www.holbeinartistmaterials.com/wp-content/uploads/2020/12/HWCTDS.pdf, December 2020;
// Colour Index pigment names only, the dyes of the fluorescent colours and NBr8 are left out).
// The range was checked against the colour list of the safety data sheet of 2025-08-08
// (https://holbeinartistmaterials.com/wp-content/uploads/2026/06/HWC-WATER-MEDIA-ARTISTS-WATERCOLOR-2025.08.08.pdf).
// Colours: the median of the band 20 to 40 % across each painted strip of the chart (strong at the
// left), the whites as white. Unverified (`hex: null`): the metallic (mica) and fluorescent colours,
// and a strip whose hue turns by more than 25 degrees from that band to the pale band (55 to 75 %).
// Written by tools/charts/holbein.py."""))
