# Playbook: Make the WLSA Sound Art Club Recruitment Poster

## Purpose

Generate a print-ready recruitment poster (A2, 300 dpi PNG) for the
WLSA Sound Art Club from the source design in `src/poster/`. After execution,
`poster.png` exists at the project root and is ready to print or share.

## Prerequisites

- A Chromium browser installed and discoverable by the render script
  (Google Chrome or Microsoft Edge).
- Source design present: `src/poster/poster.html` and `src/poster/poster.css`.
- Python 3 + Pillow to run the verification test (optional).
- **Abort before the steps if no browser is found** — the script errors clearly.

## Steps

1. Edit `src/poster/poster.html` / `src/poster/poster.css` to change wording
   or styling.
2. Run `bash scripts/render_poster.sh` — renders `poster.png` (A2 @ 300 dpi)
   and a downscaled preview into `.tmp/`.
3. Run `python tests/check_poster.py` to verify the output dimensions.

## Expected Outcome

- `poster.png` — 4961 × 7016 px (A2 at 300 dpi).
- `.tmp/poster-preview.png` — low-res preview for quick viewing.

## Rollback Plan

- The render script only **reads** the source files; it never modifies them.
- To revert the output, delete `poster.png` and `.tmp/poster-preview.png`.
  The previous design is fully preserved in `src/poster/`.

### Directory Structure

```
project-root/
├── CLAUDE.md
├── README.md
├── playbooks/
│   └── make-poster.md
├── scripts/
│   └── render_poster.sh
├── src/
│   └── poster/
│       ├── poster.html
│       └── poster.css
├── tests/
│   └── check_poster.py
└── .tmp/
```
