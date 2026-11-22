#!/usr/bin/env python3
"""Convert assets/icon.jpg into 256x256 icon.png and multi-size icon.ico."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'icon.jpg')
TARGETS = [
    os.path.join(ROOT, 'assets'),
    os.path.join(ROOT, 'public', 'assets'),
]

img = Image.open(SRC).convert('RGBA')
img256 = img.resize((256, 256), Image.Resampling.LANCZOS)

for out_dir in TARGETS:
    os.makedirs(out_dir, exist_ok=True)
    img256.save(os.path.join(out_dir, 'icon.png'), format='PNG')
    img.save(
        os.path.join(out_dir, 'icon.ico'),
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

print('Generated icon.png and icon.ico in assets/ and public/assets/')
