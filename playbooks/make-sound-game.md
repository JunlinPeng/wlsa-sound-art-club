# Playbook: Make the "Sound Blind Box" Web Game (60+ city sounds)

## Purpose

Produce a self-contained web game for the CCA Fair booth: a player hears a
mystery Shanghai/city sound and guesses it from four bilingual (EN + 中文)
options. After execution, opening `src/game/index.html` in a browser runs a
10-round game over **65 real sounds** downloaded from Freesound, ending with a
"collect our club stamp" call to action.

## Prerequisites

- Python 3 (stdlib only — no third-party packages).
- A free Freesound API key (https://freesound.org/apiv2/apply/) — required for
  downloading the audio. **Abort the download step if no key is available.**
- `src/game/data/sounds.json` present (the 65-entry source of truth).
- A Chromium browser (optional — only for the headless smoke test).

## Steps

1. (Optional) Edit `src/game/data/sounds.json` to add/change sounds.
2. Run `python scripts/fetch_sounds.py --generate-only` — writes
   `src/game/sounds.js` and `sounds/review.json` without downloading.
3. Run `python scripts/fetch_sounds.py --token <KEY>` — downloads each sound's
   top-rated preview to `src/game/sounds/{id:02d}.mp3` and regenerates
   `sounds.js` + `review.json`.
4. Open `src/game/index.html` in a browser and play.

## Expected Outcome

- `src/game/sounds/` holds 65 (or ~60+) non-empty `.mp3` files.
- `src/game/sounds.js` declares `window.SOUNDS` with ≥ 60 entries.
- `src/game/sounds/review.json` maps each query to its Freesound id/name/license
  so any mismatched sound can be spotted and replaced.

## Rollback Plan

- Delete `src/game/sounds/*.mp3` and `src/game/sounds.js`, then re-run
  `scripts/fetch_sounds.py` to regenerate. `sounds.json` and the HTML/CSS/JS
  are static and preserved.

### Directory Structure

```
project-root/
├── CLAUDE.md
├── playbooks/
│   └── make-sound-game.md
├── scripts/
│   └── fetch_sounds.py          # search + download + generate manifest
├── src/
│   └── game/
│       ├── index.html           # the game (single page)
│       ├── game.css             # brand styles
│       ├── game.js              # game logic
│       ├── sounds.js            # generated manifest (window.SOUNDS)
│       ├── data/sounds.json     # source of truth (65 entries)
│       └── sounds/              # downloaded MP3s (gitignored) + review.json
└── tests/
```
