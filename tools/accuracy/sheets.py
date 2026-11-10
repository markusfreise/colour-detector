"""Turns the raw pictures of render.mjs into one sheet per photo: the photo, the flat picture at
Simplify shown as 0, the same at 3, and what is lost at 0 (light things in magenta, dark ones in blue).
Usage: python3 sheets.py <out dir>"""
import pathlib
import sys

from PIL import Image

out = pathlib.Path(sys.argv[1])
for size in sorted(out.glob('*.size')):
    name = size.stem
    w, h = map(int, size.read_text().split())
    parts = []
    for tag in ('photo', 's0', 's3', 'lost'):
        raw = out / f'{name}-{tag}.rgb'
        parts.append(Image.frombytes('RGB', (w, h), raw.read_bytes()))
        raw.unlink()
    size.unlink()
    sheet = Image.new('RGB', (w * 2 + 10, h * 2 + 10), 'white')
    for i, part in enumerate(parts):
        sheet.paste(part, ((i % 2) * (w + 10), (i // 2) * (h + 10)))
    sheet.save(out / f'{name}.png')
