# Playbook: Make the First-Meeting PowerPoint

## Purpose

Produce a short, appealing PowerPoint for the club's first CCA meeting, styled
to match the existing recruitment deck (`WLSA_Sound_Art_Club.pptx` — Georgia
titles, Segoe UI labels, cream background, brand orange/blue/coral accents).
After execution, `WLSA_Sound_Art_Club_First_Meeting.pptx` exists at the project
root with four slides: welcome intro, self-introductions, a Kahoot warm-up, and
the guess-the-sound game (launched via a button that opens `src/game/index.html`).

## Prerequisites

- `python-pptx` installed (`pip install python-pptx`).
- The template deck present: `C:\Users\Junlin Peng\Downloads\WLSA_Sound_Art_Club.pptx`.
- A game preview screenshot at `.tmp/game-home.png` (render it with headless
  Edge before building, or the script will fail on the missing image).
- The game itself present at `src/game/index.html` (with its `sounds/`).

## Steps

1. Render the game preview screenshot (headless Edge, ~1280x720) into
   `.tmp/game-home.png`.
2. Run `python scripts/build_meeting_deck.py` — builds the four slides and saves
   the `.pptx` to the project root.
3. Open the `.pptx`, run the slideshow, and click **Launch game** on slide 4 to
   confirm the game opens in the browser.

## Expected Outcome

- `WLSA_Sound_Art_Club_First_Meeting.pptx` — 4 slides, 16:9 (13.33 x 7.5 in),
  cream background, matching the recruitment deck's typography and palette.
- Slide 4's "Launch game" button hyperlinks to
  `file:///D:/WLSA/CCA%20Setup/src/game/index.html`.

## Rollback Plan

- The build script only writes a new `.pptx`; it never modifies the template
  deck or `src/game/`. Delete `WLSA_Sound_Art_Club_First_Meeting.pptx` and
  re-run the script to regenerate.

### Directory Structure

```
project-root/
├── CLAUDE.md
├── playbooks/
│   └── make-meeting-deck.md
├── scripts/
│   └── build_meeting_deck.py    # builds the .pptx with python-pptx
├── src/
│   └── game/                    # linked target (the Sound Blind Box game)
├── .tmp/game-home.png           # game preview used on slide 4
└── WLSA_Sound_Art_Club_First_Meeting.pptx   # output
```
