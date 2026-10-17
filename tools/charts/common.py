"""What the chart readers in tools/charts/ share: colour maths and the catalogue file they write."""
import json

import numpy as np


def lab(rgb):
    """CIE L*a*b* (D65) of an sRGB colour given as 0..255."""
    c = np.asarray(rgb, dtype=float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ c / [0.95047, 1, 1.08883]
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])


def hue_shift(a, b):
    """Angle between the hues of two colours in degrees; 0 when either is nearly grey."""
    _, a1, b1 = lab(a)
    _, a2, b2 = lab(b)
    if np.hypot(a1, b1) < 8 or np.hypot(a2, b2) < 8:
        return 0
    d = abs(np.degrees(np.arctan2(b1, a1) - np.arctan2(b2, a2))) % 360
    return int(round(min(d, 360 - d)))


def js_catalogue(name, colours, header):
    """A catalogue file of src/data/: the header comment and one colour per line."""
    rows = ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in colours)
    return f'{header}\nexport const {name} = [\n{rows},\n]'
