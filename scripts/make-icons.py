#!/usr/bin/env python3
"""Render the app icons (sun + cloud over hills) into public/.

Dependency-free: shapes are rasterised with 6x6 supersampling and written as
PNG via zlib. favicon.svg mirrors the same geometry. Run: python3 scripts/make-icons.py
"""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

SKY_TOP, SKY_BOTTOM = (0x2b, 0x4f, 0x8a), (0xf4, 0xc4, 0x8a)
SUN = (0xff, 0xd3, 0x6b)
CLOUD = (0xf5, 0xf7, 0xfb)
HILL_BACK, HILL_FRONT = (0x4f, 0x8a, 0x62), (0x2d, 0x5e, 0x46)

# Geometry in unit space (0..1), painted back to front.
SUN_C = (0.64, 0.38, 0.18)
CLOUD_CIRCLES = [(0.33, 0.55, 0.10), (0.47, 0.47, 0.14), (0.61, 0.55, 0.10)]
CLOUD_BAR = (0.33, 0.61, 0.55, 0.65)  # x0, x1, y0, y1 (joins the puffs flat at the base)
HILLS = [((0.18, 1.30, 0.58), HILL_BACK), ((0.92, 1.42, 0.66), HILL_FRONT)]


def inside(c, x, y):
    return (x - c[0]) ** 2 + (y - c[1]) ** 2 <= c[2] ** 2


def colour_at(x, y):
    t = min(max(y, 0), 1)
    col = tuple(a + (b - a) * t for a, b in zip(SKY_TOP, SKY_BOTTOM))
    if inside(SUN_C, x, y):
        col = SUN
    x0, x1, y0, y1 = CLOUD_BAR
    if any(inside(c, x, y) for c in CLOUD_CIRCLES) or (x0 <= x <= x1 and y0 <= y <= y1):
        col = CLOUD
    for c, hc in HILLS:
        if inside(c, x, y):
            col = hc
    return col


def rounded_mask(x, y, r):
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, corner=0.0, ss=6):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            cover = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) / size
                    y = (py + (sy + 0.5) / ss) / size
                    if corner and not rounded_mask(x, y, corner):
                        continue
                    c = colour_at(x, y)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
                    cover += 1
            n = ss * ss
            if cover:
                row += bytes(round(v / cover) for v in acc) + bytes([round(255 * cover / n)])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return png(size, b''.join(rows))


def png(size, raw):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def ico(pngs):
    """ICO container holding PNG-encoded images (supported by all current browsers)."""
    header = struct.pack('<HHH', 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b'', b''
    for size, data in pngs:
        entries += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    return header + entries + blobs


def svg():
    hex_ = lambda c: '#%02x%02x%02x' % c
    s = lambda v: f'{v * 64:g}'
    x0, x1, y0, y1 = CLOUD_BAR
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
        f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hex_(SKY_TOP)}"/>'
        f'<stop offset="1" stop-color="{hex_(SKY_BOTTOM)}"/></linearGradient>'
        '<clipPath id="r"><rect width="64" height="64" rx="14"/></clipPath></defs>',
        '<g clip-path="url(#r)">',
        '<rect width="64" height="64" fill="url(#sky)"/>',
        f'<circle cx="{s(SUN_C[0])}" cy="{s(SUN_C[1])}" r="{s(SUN_C[2])}" fill="{hex_(SUN)}"/>',
        f'<g fill="{hex_(CLOUD)}">'
        + ''.join(f'<circle cx="{s(c[0])}" cy="{s(c[1])}" r="{s(c[2])}"/>' for c in CLOUD_CIRCLES)
        + f'<rect x="{s(x0)}" y="{s(y0)}" width="{s(x1 - x0)}" height="{s(y1 - y0)}"/></g>',
    ]
    parts += [f'<circle cx="{s(c[0])}" cy="{s(c[1])}" r="{s(c[2])}" fill="{hex_(hc)}"/>' for c, hc in HILLS]
    parts += ['</g></svg>']
    return '\n'.join(parts) + '\n'


def write(name, data):
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(data)


if __name__ == '__main__':
    fav16, fav32, fav48 = render(16, 0.22), render(32, 0.22), render(48, 0.22)
    write('favicon-16x16.png', fav16)
    write('favicon-32x32.png', fav32)
    write('favicon.ico', ico([(16, fav16), (32, fav32), (48, fav48)]))
    write('apple-touch-icon.png', render(180))  # full-bleed: iOS applies its own corner mask
    write('favicon.svg', svg().encode())
    print('icons written to', os.path.abspath(OUT))
