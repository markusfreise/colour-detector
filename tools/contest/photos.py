"""Prepares the test photos of the contest: the samples of the app at the size the app works on,
as raw RGBA with a .size file next to each. Needs Pillow. Usage: python3 photos.py <repo path>"""
import math
import pathlib
import sys

from PIL import Image

WORK_PIXELS = 800 * 600  # as in src/stores/analysis.js
SAMPLES = {
    'family': 'local-samples/family.webp',
    'meadow': 'local-samples/meadow.webp',
    'stage': 'local-samples/stage.webp',
    'portrait': 'local-samples/portrait.webp',
    'street': 'public/sample-bielefeld.webp',
    'idwal': 'public/sample-llyn-idwal.webp',
}

repo = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).parent / 'photos'
out.mkdir(exist_ok=True)
for name, file in SAMPLES.items():
    image = Image.open(repo / file).convert('RGBA')
    scale = min(1, math.sqrt(WORK_PIXELS / (image.width * image.height)))
    width, height = max(1, round(image.width * scale)), max(1, round(image.height * scale))
    image = image.resize((width, height), Image.LANCZOS)
    (out / f'{name}.raw').write_bytes(image.tobytes())
    (out / f'{name}.size').write_text(f'{width} {height}\n')
    image.convert('RGB').save(out / f'{name}.png')
    print(name, width, height)
