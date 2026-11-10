"""Prepares the test photos: every sample of the app, and what is in local-samples/, at the size
the app works on, as raw RGBA with a .size file next to each. Needs Pillow.
Usage: python3 photos.py <repo path>"""
import math
import pathlib
import sys

from PIL import Image

WORK_PIXELS = 800 * 600  # as in src/stores/analysis.js

repo = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).parent / 'photos'
out.mkdir(exist_ok=True)
files = sorted(repo.glob('public/sample-*.webp')) + sorted((repo / 'local-samples').glob('*.webp'))
for file in files:
    name = file.stem.removeprefix('sample-')
    image = Image.open(file).convert('RGBA')
    scale = min(1, math.sqrt(WORK_PIXELS / (image.width * image.height)))
    width, height = max(1, round(image.width * scale)), max(1, round(image.height * scale))
    image = image.resize((width, height), Image.LANCZOS)
    (out / f'{name}.raw').write_bytes(image.tobytes())
    (out / f'{name}.size').write_text(f'{width} {height}\n')
    print(name, width, height)
