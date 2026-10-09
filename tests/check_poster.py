#!/usr/bin/env python3
"""Verify the rendered poster PNG matches A2 at 300 dpi.

Run after `bash scripts/render_poster.sh`.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
POSTER = ROOT / "poster.png"

# A2 = 420 x 594 mm. At 300 dpi: 420/25.4*300 x 594/25.4*300.
TARGET_W, TARGET_H = 4961, 7016
TOL = 8  # px tolerance for rounding in the rasterizer


def main() -> int:
    if not POSTER.exists():
        print(f"FAIL: {POSTER.name} not found. Run scripts/render_poster.sh first.")
        return 1

    with Image.open(POSTER) as im:
        w, h = im.size

    print(f"{POSTER.name}: {w} x {h} px")

    ok_w = abs(w - TARGET_W) <= TOL
    ok_h = abs(h - TARGET_H) <= TOL

    if ok_w and ok_h:
        print(f"PASS: dimensions match A2 @ 300 dpi (~{TARGET_W} x {TARGET_H}).")
        return 0

    print(f"FAIL: expected ~{TARGET_W} x {TARGET_H}, got {w} x {h}.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
