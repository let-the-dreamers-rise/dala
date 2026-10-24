"""Render the Dala logo: a thread crossing three stops and ending at a gold home dot.

Usage: python scripts/make-logo.py  (writes app/brand/dala-logo.png and dala-logo-1024.png)
"""
from pathlib import Path

from PIL import Image, ImageDraw

TEAL = (13, 107, 102)
WHITE = (255, 255, 255)
GOLD = (242, 193, 78)
SS = 4  # supersampling factor for smooth edges
OUT = Path(__file__).resolve().parent.parent / "brand"


def bezier(p0, p1, p2, p3, steps=1200):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def render(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=TEAL)

    k = s / 512  # design grid is 512 units
    segs = [
        ((96, 196), (150, 120), (200, 290), (256, 230)),
        ((256, 230), (312, 170), (360, 150), (380, 250)),
        ((380, 250), (396, 330), (410, 380), (412, 392)),
    ]
    pts = []
    for seg in segs:
        pts += bezier(*[(x * k, y * k) for x, y in seg])
    # Stamp round dots along the curve: smoother than a thick polyline in Pillow.
    half = 15 * k
    for x, y in pts:
        d.ellipse([x - half, y - half, x + half, y + half], fill=WHITE)
    for x, y in [(96, 196)]:
        r = 15 * k
        d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=WHITE)
    for x, y in [(256, 230), (380, 250)]:
        r, ri = 26 * k, 13 * k
        d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=WHITE)
        d.ellipse([x * k - ri, y * k - ri, x * k + ri, y * k + ri], fill=TEAL)
    hx, hy, hr = 412 * k, 392 * k, 44 * k
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    render(512).save(OUT / "dala-logo.png")
    render(1024).save(OUT / "dala-logo-1024.png")
    print("wrote", OUT / "dala-logo.png")
