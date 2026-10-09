# Playbook: Make the WLSA Sound Art Club CCA Fair Booth Kit

## Purpose

Produce the print-ready assets the WLSA Sound Art Club needs for the CCA Fair
booth, following the Fair Preparation Meeting instructions. After execution the
following exist at the project root and are ready to print or hand to a stamp
maker:

- `stamp.svg` / `stamp.png` — the **required 2 cm club stamp** (headphones icon,
  single orange ink, no gold).
- `badge.svg` / `badge.png` — a round badge (curved club name + headphones icon)
  for printing on plush toys or patches.
- `poster.png` — the refreshed recruitment poster, now with a "Sound Blind Box"
  game teaser and a founding-member perk line to draw foot traffic.
- `game-card.png` — an A5 "Sound Blind Box" booth sign (how-to-play + prize hook).
- `pitch-card.png` — an A6 handout (tagline + perks + scan-to-join QR).

Together these give the booth an interactive hook and a clear join path, the
"attract students" requirement.

## Prerequisites

- A Chromium browser (Google Chrome or Microsoft Edge) installed and discoverable
  by the render scripts.
- Source designs present: `src/stamp/`, `src/fair/`, `src/poster/`.
- Python 3 + Pillow to run the verification tests (optional but recommended).
- **Abort before the steps if no browser is found** — the scripts error clearly.

## Steps

1. (Design) Edit `src/stamp/stamp.svg`, `src/badge/badge.svg`,
   `src/fair/game-card.html`, `src/fair/pitch-card.html`, or
   `src/poster/poster.html` / `poster.css` to change content.
2. Run `bash scripts/render_stamp.sh` — renders `stamp.png` (1200 x 1200 preview).
3. Run `bash scripts/render_badge.sh` — renders `badge.png` (1600 x 1600 preview).
4. Run `bash scripts/render_fair.sh` — renders `game-card.png` (A5) and
   `pitch-card.png` (A6).
5. Run `bash scripts/render_poster.sh` — re-renders `poster.png` (A2 @ 300 dpi).
6. Run `python tests/check_stamp.py` and `python tests/check_poster.py` to verify
   output dimensions.

## Expected Outcome

- `stamp.svg` — 20 mm (2 cm) circular vector stamp, headphones icon, orange ink.
- `stamp.png` — 1200 x 1200 px preview.
- `badge.svg` / `badge.png` — round badge, 1600 x 1600 px preview.
- `game-card.png` — ~1748 x 2481 px (A5 @ 300 dpi).
- `pitch-card.png` — ~1240 x 1748 px (A6 @ 300 dpi).
- `poster.png` — ~4961 x 7016 px (A2 @ 300 dpi).

## Rollback Plan

- The render scripts only **read** their source files; they never modify them.
- To revert an asset, delete the generated PNG (`stamp.png`, `game-card.png`,
  `pitch-card.png`, `poster.png`) and re-run the script from the unchanged source.
- `poster.html` / `poster.css` changes (teaser + perk line) are fully reversible;
  remove those blocks to restore the previous poster.

### Directory Structure

```
project-root/
├── CLAUDE.md
├── README.md
├── playbooks/
│   ├── make-poster.md
│   └── make-fair-kit.md
├── scripts/
│   ├── render_poster.sh
│   ├── render_stamp.sh
│   └── render_fair.sh
├── src/
│   ├── poster/          # recruitment poster (html/css/fonts/qr)
│   ├── stamp/           # 2 cm stamp (svg + preview html)
│   └── fair/            # game-card.html, pitch-card.html, fair.css
├── tests/
│   ├── check_poster.py
│   └── check_stamp.py
├── stamp.svg
├── stamp.png
├── game-card.png
├── pitch-card.png
├── poster.png
└── .tmp/
```
