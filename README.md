# WLSA Sound Art Club — Recruitment & CCA Fair Kit

A project to design and render the print-ready assets for the
**WLSA Sound Art Club** — a recruitment poster plus the CCA Fair booth kit.

- **Poster**: `poster.png` — A2 (420 × 594 mm) at **300 dpi** (4961 × 7016 px), English only.
- **CCA Fair booth kit**: `stamp.svg` (2 cm stamp), `game-card.png` (A5),
  `pitch-card.png` (A6), plus the refreshed poster.
- **Source**: HTML/CSS (and SVG) designs rendered headlessly with Chrome/Edge
  (no runtime dependencies).

## Quick start

```bash
# 1. Edit the design (if needed)
#    src/poster/poster.html  +  src/poster/poster.css

# 2. Render the poster
bash scripts/render_poster.sh

# 3. Verify the output is A2 @ 300 dpi
python tests/check_poster.py
```

- Final deliverable: `poster.png`
- Quick low-res preview: `.tmp/poster-preview.png`

## How it works

The poster is authored as a fixed-size HTML page (`src/poster/`), laid out on a
logical **1587 × 2245 px** canvas (A2 at 96 dpi). The render script drives a
headless Chromium browser with `--force-device-scale-factor=3.125`
(= 300 / 96) to rasterize it at **4961 × 7016 px** — exactly A2 at 300 dpi.

## CCA Fair booth kit

For the CCA Fair, the club also needs a **2 cm stamp** (the Fair "Passport"
activity) plus booth materials to attract students:

```bash
bash scripts/render_stamp.sh   # stamp.png (1200x1200 preview of the 2 cm stamp)
bash scripts/render_badge.sh   # badge.png (round badge for plush-toy printing)
bash scripts/render_fair.sh    # game-card.png (A5) + pitch-card.png (A6)
bash scripts/render_poster.sh  # poster.png (A2, refreshed with a game teaser)
```

| Asset | File | Size | Purpose |
|-------|------|------|---------|
| Stamp | `stamp.svg` / `stamp.png` | 2 cm circle | Required Fair stamp — headphones icon, orange ink (no gold) |
| Badge | `badge.svg` / `badge.png` | round | Plush-toy / patch print — curved club name + headphones icon |
| Game card | `game-card.png` | A5 (148 × 210 mm) | "Sound Blind Box" booth sign — how-to-play + prize hook |
| Pitch card | `pitch-card.png` | A6 (105 × 148 mm) | Handout — tagline + perks + scan-to-join QR |
| Poster | `poster.png` | A2 (420 × 594 mm) | Recruitment poster, refreshed with a game teaser |

`stamp.svg` is the source of truth for the physical stamp (a true vector with a
20 mm diameter, ready for a stamp maker). The PNGs are previews/print files.

## Sound Blind Box web game

An interactive booth game: hear a mystery city sound and guess it from four
bilingual (EN + 中文) options. Self-contained in `src/game/` — just open
`src/game/index.html` in a browser (no server or build step).

```bash
python scripts/fetch_sounds.py --token <FREESOUND_API_KEY>   # download 65 sounds
# then open src/game/index.html
```

- `src/game/data/sounds.json` — the source of truth: 65 Shanghai/city sounds
  (id, English + Chinese name, category, Freesound search query).
- `scripts/fetch_sounds.py` — searches Freesound for each query, downloads the
  top-rated preview MP3 to `src/game/sounds/`, and generates `sounds.js`.
- Get a free API key at https://freesound.org/apiv2/apply/.
- `python scripts/fetch_sounds.py --generate-only` writes the manifest without
  downloading (the game then shows a "missing audio" hint per sound).

## First-meeting PowerPoint

A short meeting deck styled to match the recruitment deck (Georgia + Segoe UI,
cream background, brand orange/blue/coral). Four slides: welcome intro,
self-introductions, a Kahoot warm-up, and the guess-the-sound game — slide 4's
**Launch game** button opens `src/game/index.html` in the browser.

```bash
python scripts/build_meeting_deck.py   # -> WLSA_Sound_Art_Club_First_Meeting.pptx
```

Needs `pip install python-pptx` and a game preview screenshot at
`.tmp/game-home.png` (rendered with headless Edge).

## Shanghai Sound Map

The club's founding vision, online: click a place on a real (drawn, non-satellite)
map of Shanghai and hear its sound. A static site in `src/soundmap/` — no build
step — deployed to GitHub Pages, with Supabase behind it (database, login, and a
**private** audio bucket; only approved audio is ever served, via 4-hour signed
URLs).

- **Map**: AMap (高德) JS API 2.0, standard vector style, centered on Shanghai.
  The map is an enhancement, never the only path — a fully accessible list mode
  mirrors every capability, and map load failure auto-redirects to it.
- **Content loop**: club members sign up → an admin approves the account →
  members submit recordings through a 3-step wizard (audio → location picker →
  story) → an admin approves or rejects (with a required bilingual note).
  Approval integrity is enforced in the database (RLS + triggers), not the UI.
- **Every sound carries**: recording time/place, category, story (EN + 中文),
  Mandarin transcript, dialect text + explanation, and a required 音频描述
  (audio description for visually impaired children, read aloud on the detail
  page via the Web Speech API).
- **v1 ships EMPTY** — the booth game's 65 Freesound placeholder mp3s are not
  reused (not real Shanghai recordings). The first content drop is the
  December "Hearing a Day in Shanghai" theme (20–30 sounds), imported with
  `scripts/seed_sounds.py`.

```bash
bash scripts/serve.sh                        # local dev on http://localhost:8000
python tests/check_soundmap.py               # static checks (config, GCJ-02, category sync…)
python tests/check_rls.py                    # behavioral RLS matrix (needs scripts/.env)
python tests/check_seed.py                   # validate the seed CSV
```

Full launch instructions — Supabase setup, AMap key + securityJsCode, first
admin, deployment, school-network smoke test — live in
[playbooks/launch-soundmap.md](playbooks/launch-soundmap.md).

**Out of scope for v1** (documented in the launch playbook): WeChat mini-program
(the vision doc defers it), open anonymous submissions (members-only; junk
signups get zero permissions), TTS-generated audio descriptions, photo uploads,
and a language toggle (both languages are always shown, club convention).

## Project structure

```
project-root/
├── CLAUDE.md                  # Project conventions (see "Collaboration Framework")
├── README.md                  # This file
├── CHANGELOG.md               # Notable changes, newest first
├── .github/workflows/
│   ├── deploy.yml             # Static checks gate the GitHub Pages deploy
│   └── keepalive.yml          # Weekly Supabase ping (free-tier pause guard)
├── playbooks/
│   ├── make-poster.md         # Orchestration: the poster task (what & why)
│   ├── make-fair-kit.md       # Orchestration: the CCA Fair booth kit
│   ├── make-sound-game.md     # Orchestration: the Sound Blind Box web game
│   ├── make-meeting-deck.md   # Orchestration: the first-meeting PowerPoint
│   └── launch-soundmap.md     # Orchestration: launch the Shanghai Sound Map
├── scripts/
│   ├── render_poster.sh       # Execution: renders poster.png + preview
│   ├── render_stamp.sh        # Execution: renders stamp.png
│   ├── render_badge.sh        # Execution: renders badge.png
│   ├── render_fair.sh         # Execution: renders game-card.png + pitch-card.png
│   ├── fetch_sounds.py        # Execution: downloads game audio + writes sounds.js
│   ├── build_meeting_deck.py  # Execution: builds the meeting .pptx
│   ├── sql/001_init.sql       # Sound Map schema + triggers + RLS (idempotent)
│   ├── apply_schema.sh        # Applies 001_init.sql, verifies tables/bucket
│   ├── make_admin.sh          # <email> -> role='admin' (first-admin bootstrap)
│   ├── promote_members.sh     # CSV of emails -> role='member'
│   ├── seed_sounds.py         # Bulk import + publish (December theme)
│   ├── data/sounds_seed.csv   # Seed template (header-only; v1 is empty)
│   ├── backup_soundmap.py     # pg_dump + storage download into a zip
│   ├── cleanup_orphan_audio.py# Delete stray audio objects (dry-run default)
│   ├── smoke_test.py          # School-network reachability + browser check
│   ├── serve.sh               # Local dev server (AMap whitelist localhost)
│   ├── vendor_supabase.sh     # Vendors a pinned supabase-js UMD build
│   ├── _supa.py               # Shared stdlib Supabase REST client
│   └── .env.example           # Credentials template (.env is gitignored)
├── src/
│   ├── poster/
│   │   ├── poster.html        # Poster content & structure
│   │   ├── poster.css         # Poster design system & layout
│   │   ├── qr.png             # Scan-to-join QR code (shown on the poster)
│   │   └── fonts/             # Bundled WOFF2 fonts (offline render)
│   ├── stamp/
│   │   ├── stamp.svg          # 2 cm stamp (vector source of truth)
│   │   └── stamp.html         # Stamp preview page
│   ├── badge/
│   │   └── badge.svg          # Round badge (curved name + headphones icon)
│   ├── fair/
│   │   ├── game-card.html     # Sound Blind Box game card (A5)
│   │   ├── pitch-card.html    # Pitch card (A6)
│   │   └── fair.css           # Shared card design system
│   ├── game/
│   │   ├── index.html         # Sound Blind Box web game
│   │   ├── game.css / game.js # Styles + logic
│   │   ├── sounds.js          # Generated manifest (window.SOUNDS)
│   │   ├── data/sounds.json   # Source of truth (65 entries)
│   │   └── sounds/            # Downloaded MP3s (gitignored)
│   └── soundmap/              # Shanghai Sound Map (deployed to GitHub Pages)
│       ├── index.html         # Shell; _AMapSecurityConfig BEFORE the loader
│       ├── config.js          # Public keys (config.example.js = template)
│       ├── css/soundmap.css   # Design system (brand palette + Fraunces/Inter)
│       ├── fonts/             # Bundled WOFF2 fonts
│       ├── vendor/            # Vendored supabase-js (no CDN)
│       └── js/                # app, map, player, list, detail, wizard, admin, auth
├── tests/
│   ├── check_poster.py        # Verifies output dimensions (A2 @ 300 dpi)
│   ├── check_stamp.py         # Verifies the stamp PNG is square
│   ├── check_soundmap.py      # Static verifier for the Sound Map
│   ├── check_rls.py           # Behavioral RLS matrix (SKIPs without .env)
│   └── check_seed.py          # Validates the seed CSV
├── .tmp/                      # Intermediate artifacts (not committed)
│   └── poster-preview.png
├── poster.png                 # Final poster (generated)
├── stamp.svg / stamp.png      # 2 cm stamp (source + preview)
├── badge.svg / badge.png      # Round badge (source + preview)
├── game-card.png              # A5 game card (generated)
├── pitch-card.png             # A6 pitch card (generated)
└── WLSA_Sound_Art_Club_First_Meeting.pptx  # First-meeting deck (generated)
```

## Editing the poster

All content lives in [src/poster/poster.html](src/poster/poster.html) and the
design system in [src/poster/poster.css](src/poster/poster.css). Font sizes are
specified in logical pixels (96-dpi design space); the render script scales them
up 3.125× automatically.

To change wording, edit the text blocks in the HTML. To restyle, edit the CSS
variables at the top of `poster.css` (colors) and the component rules below.

### Design notes

- **Concept** — "Sound as Light": sound rendered as warm light, for a
  community-service club that helps visually-impaired children "see" their
  hometown through hearing.
- **Theme / background** — light & colorful, word-light: a bright cream page with
  a playful orange / blue / coral palette and a flat colorful city skyline. Two
  bold ideas carry the poster — *what the club does* and *its main objective* —
  so the message lands fast.
- **Palette** (CSS variables): cream paper, warm near-black ink, and three
  accents — orange `#E8590C`, blue `#0E86C8`, coral-red `#E04028` (taken from
  the reference templates).
- **QR code** — `src/poster/qr.png` (a square scan-to-join code cropped from the
  supplied image), shown bottom-right on a white card with a "Scan to join"
  caption.
- **Illustrations** — flat cartoon figures drawn inline as SVG (a large child
  listening on headphones, a microphone, a vinyl record, and a scatter of floating
  music notes) fill the empty space, echoing the club's recording/listening theme
  in the same orange/blue/coral palette. Soft concentric "sound-ripple" rings sit
  behind the figures to fill the middle band with a subtle, on-theme texture.
- **Type** — bundled local fonts (offline render):
  - `Fraunces` (warm display serif) — title, tagline, mission, fact values.
  - `Inter` (clean sans) — labels.
  Files live in `src/poster/fonts/` and are loaded via `@font-face`. To swap in a
  different brand face, drop the `.woff2` into that folder and update the
  `@font-face` rules at the top of `poster.css`.
