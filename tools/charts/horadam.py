"""Schmincke Horadam Aquarell: reads the colour cards of Schmincke's Horadam page (English and
German) and their swatch images and writes src/data/horadam-catalogue.js, or with `supergranulation`
the supergranulating colours, a library of their own, src/data/horadam-supergranulation-catalogue.js.
See tools/charts/README.md for the files it needs.

    python3 -I tools/charts/horadam.py <folder with en.html, de.html and swatches/> > /tmp/horadam.js
    mv /tmp/horadam.js src/data/horadam-catalogue.js
    python3 -I tools/charts/horadam.py <folder> supergranulation > /tmp/horadam.js
    mv /tmp/horadam.js src/data/horadam-supergranulation-catalogue.js

The colours already in a catalogue keep their value, so that the stock and the common colours
measured from it stay as they are; only a colour new to it is measured here. That is why the
output goes to another file first: written straight into the catalogue, the shell would empty it
before it is read, and every colour would be measured again.
"""
import html
import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import js_catalogue, lab  # noqa: E402

folder = sys.argv[1]
SUPERGRANULATION = sys.argv[2:] == ['supergranulation']
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../src/data')
CATALOGUES = ['horadam-catalogue.js', 'horadam-supergranulation-catalogue.js']
# Schmincke's opacity symbols: lasierend, halb lasierend, halb deckend, deckend.
TRANSPARENCY = {'L': 'T', 'HL': 'ST', 'HD': 'SO', 'D': 'O'}


def cards(page):
    """Article number -> the data attributes of its colour card."""
    text = open(f'{folder}/{page}').read()
    found = re.finditer(r'class="schminckede_farbkarte details[^"]*"\s+id="karte_(\d+)"(.*?)>', text, re.S)
    return {m.group(1): {k: html.unescape(v) for k, v in re.findall(r'data-([a-z]+)="([^"]*)"', m.group(2))} for m in found}


def title(name):
    """As the stock writes them: the first letter capital, the rest as Schmincke has it."""
    name = name.strip().replace('`', "'")
    return name[:1].upper() + name[1:]


def swatch(number):
    """The colour of the paint at its strongest wash, from the swatch image of its card."""
    img = np.asarray(Image.open(f'{folder}/swatches/14{number}.jpg').convert('RGB'))
    h, w, _ = img.shape
    if w < h * 1.5:
        # A wash from strong at the top to pale at the bottom, as on the printed chart: the median
        # of the band 20 to 40 % down (the values of the catalogue before were taken there too).
        band = img[int(h * 0.2):int(h * 0.4), int(w * 0.1):int(w * 0.9)].reshape(-1, 3)
        return np.median(band, axis=0)
    # A brush stroke on white (the supergranulating colours): the darker half of the paint.
    px = img.reshape(-1, 3)[::7]
    L = np.array([lab(p)[0] for p in px])
    paint, Lp = px[L < 90], L[L < 90]
    return np.median(paint[Lp <= np.median(Lp)], axis=0)


def hexed(rgb):
    return '#' + ''.join(f'{int(round(v)):02x}' for v in rgb)


known = {}
for name in CATALOGUES:
    if os.path.exists(f'{DATA}/{name}'):
        known.update(re.findall(r'"number": "(\d+)".*?"hex": "(#[0-9a-f]{6})"', open(f'{DATA}/{name}').read()))
en, de = cards('en.html'), cards('de.html')
colours = []
for article in sorted(en):
    card, number = en[article], article[2:]
    # A card without pigments and opacity is no colour (Schmincke's page has one: 031 "ONETZ").
    if not card.get('coverability') or (card.get('supergranulation') == '1') != SUPERGRANULATION:
        continue
    # Mostly "PB27,PB15:1," but also "PV19 PR179," and "PBr7/PY43,"; effect pigments have no CI name.
    pigments = [p for p in re.split(r'[,/\s]+', card['pigments']) if re.fullmatch(r'P[A-Z][a-z]?\d+(:\d+)?', p)]
    colour = {'number': number, 'name': title(card['title']), 'names': {'de': de[article]['title'].strip()}, 'hex': known.get(number) or hexed(swatch(number))}
    if pigments:
        colour['pigments'] = pigments
    colour['transparency'] = TRANSPARENCY[card['coverability']]
    colours.append(colour)

SOURCE = '''from the colour cards of Schmincke's Horadam page (schmincke.de/en/produkte/aquarell/horadam-aquarell
// and the German page, 2026-10-23)'''
if SUPERGRANULATION:
    print(js_catalogue('horadamSupergranulationCatalogue', colours, f'''// Schmincke Horadam Aquarell Supergranulation, {len(colours)} colours: numbers, English and German names,
// pigments and opacity {SOURCE}. Colours: from the swatch of their card, the darker half of the
// brush stroke; their pigments part on the paper, so one value only stands for them. Written by
// tools/charts/horadam.py.'''))
else:
    print(js_catalogue('horadamCatalogue', colours, f'''// Schmincke Horadam Aquarell, {len(colours)} colours (the supergranulating ones are a library of their
// own): numbers, English and German names, pigments and opacity {SOURCE}. Colours: measured on the
// official colour chart. Written by tools/charts/horadam.py.'''))
