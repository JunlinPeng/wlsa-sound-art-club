#!/usr/bin/env python3
"""Verify the rendered stamp PNG is square (a circular 2 cm stamp).

Run after `bash scripts/render_stamp.sh`.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
STAMP = ROOT / "stamp.png"


def main() -> int:
    if not STAMP.exists():
        print(f"FAIL: {STAMP.name} not found. Run scripts/render_stamp.sh first.")
        return 1

    with Image.open(STAMP) as im:
        w, h = im.size

    print(f"{STAMP.name}: {w} x {h} px")

    if w == h and w > 0:
        print("PASS: stamp is square (circular design).")
        return 0

    print(f"FAIL: expected a square image, got {w} x {h}.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
