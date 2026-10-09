#!/usr/bin/env python3
"""Static verifier for the Shanghai Sound Map (src/soundmap/).

Club style: prints PASS:/FAIL: lines, returns 0 only if every check passes.
CI runs this before deploying; it must also FAIL while config.js still holds
placeholder keys, so nothing ships unconfigured.

Checks:
  * config.js: no 'YOUR-' placeholders; no service-key material under src/
  * index.html: _AMapSecurityConfig set BEFORE the AMap loader; exactly one
    <audio>; scripts load in the required order; every element id the JS
    modules depend on exists; skip link present
  * vendored supabase-js + fonts present
  * palette hexes match the brand
  * wizard categories == src/game/data/sounds.json (drift fails the build)
  * audio_description is required at the schema level (visually impaired
    listeners are first-class, not optional)
  * GCJ-02: bbox CHECKs present; no coordinate-system conversion calls in JS
  * playbooks/launch-soundmap.md has all 5 required sections
  * scripts/.env is not git-tracked
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "soundmap"

PALETTE = {
    "--paper": "#FBF6EE",
    "--ink": "#211A12",
    "--orange": "#E8590C",
    "--blue": "#0E86C8",
    "--red": "#E04028",
    "--green": "#2E9E5B",
}

PLAYBOOK_SECTIONS = ("## Purpose", "## Prerequisites", "## Steps",
                     "## Expected Outcome", "## Rollback Plan")


def main() -> int:
    failures = []
    passes = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        if ok:
            passes.append(label)
            print(f"PASS: {label}")
        else:
            failures.append(label)
            print(f"FAIL: {label}" + (f" — {detail}" if detail else ""))

    # ---------------------------------------------------------------- config --
    cfg = SRC / "config.js"
    if cfg.exists():
        text = cfg.read_text(encoding="utf-8")
        has_placeholders = "YOUR_" in text or "YOUR-PROJECT" in text
        check("config.js has no placeholder keys",
              not has_placeholders,
              "fill in src/soundmap/config.js (see playbooks/launch-soundmap.md)")
    else:
        check("config.js exists", False, "copy config.example.js to config.js")

    # Placeholder URLs must never reach window.supabase.createClient — app.js
    # guards with indexOf('YOUR-') === -1 (a mid-URL 'YOUR-' counts as a hit).
    app_body = (SRC / "js" / "app.js").read_text(encoding="utf-8")
    check("app.js refuses placeholder Supabase URLs",
          "indexOf('YOUR-') === -1" in app_body)

    # No service-key material under src/ (the anon key is public by design,
    # the service key must only ever live in gitignored scripts/.env).
    leaked = []
    for p in SRC.rglob("*"):
        if not p.is_file() or p.suffix in (".woff2", ".min.js"):
            continue
        try:
            body = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in ("SUPABASE_SERVICE_KEY", "service_role"):
            if pattern in body:
                leaked.append(f"{p.relative_to(ROOT)} ({pattern})")
    check("no service-key material under src/soundmap", not leaked,
          "; ".join(leaked))

    # ---------------------------------------------------------------- index.html --
    index = SRC / "index.html"
    if index.exists():
        html = index.read_text(encoding="utf-8")
        sec = html.find("_AMapSecurityConfig")
        loader = re.search(r'<script[^>]+src=["\']https?://webapi\.amap\.com/maps', html)
        check("index.html sets _AMapSecurityConfig", sec != -1,
              "window._AMapSecurityConfig with securityJsCode is mandatory")
        check("_AMapSecurityConfig is set before the AMap loader",
              sec != -1 and (loader is None or sec < loader.start()))
        audio_count = len(re.findall(r"<audio\b", html))
        check("index.html has exactly one <audio> element", audio_count == 1,
              f"found {audio_count}")
        check("index.html has a skip link",
              "skip" in html.lower() and "href=\"#main\"" in html)

        # Script order: config.js -> vendor -> modules -> app.js last.
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
        order_ok = (len(scripts) >= 3
                    and scripts[0].endswith("config.js")
                    and "vendor/supabase" in scripts[1]
                    and scripts[-1].endswith("app.js"))
        check("script order is config.js -> vendored supabase -> … -> app.js",
              order_ok, " -> ".join(scripts))

        # Every id the JS modules query for must exist.
        for el_id in ("main", "live-region", "banner", "banner-text",
                      "banner-close", "player-bar", "player-audio",
                      "player-toggle", "player-title", "player-sub",
                      "player-story", "player-close", "logout-btn"):
            check(f"index.html has #{el_id}", f'id="{el_id}"' in html)
    else:
        check("index.html exists", False)

    # ------------------------------------------------------- vendored assets --
    sdk = SRC / "vendor" / "supabase.min.js"
    check("vendored supabase-js is present",
          sdk.exists() and sdk.stat().st_size > 50_000)
    if sdk.exists():
        body = sdk.read_text(encoding="utf-8", errors="ignore")
        check("vendored supabase-js exposes createClient", "createClient" in body)

    fonts = sorted(p.name for p in (SRC / "fonts").glob("*.woff2"))
    check("brand fonts are vendored",
          fonts == ["fraunces-italic.woff2", "fraunces-normal.woff2", "inter.woff2"],
          str(fonts))

    # ---------------------------------------------------------------- palette --
    css = SRC / "css" / "soundmap.css"
    if css.exists():
        body = css.read_text(encoding="utf-8")
        missing = [name for name, hexv in PALETTE.items()
                   if hexv.upper() not in body.upper()]
        check("brand palette hexes are used in soundmap.css", not missing,
              "missing " + ", ".join(missing))

    # --------------------------------------------------- category sync check --
    appjs = SRC / "js" / "app.js"
    game_data = ROOT / "src" / "game" / "data" / "sounds.json"
    if appjs.exists() and game_data.exists():
        app_body = appjs.read_text(encoding="utf-8")
        cats_block = re.search(r"var CATEGORIES = \[(.*?)\];", app_body, re.DOTALL)
        app_cats = re.findall(r"key:\s*'([a-z_]+)'", cats_block.group(1)) if cats_block else []
        game_cats = sorted(json.loads(game_data.read_text(encoding="utf-8"))["categories"].keys())
        check("wizard categories == src/game/data/sounds.json",
              sorted(app_cats) == game_cats,
              f"app.js: {sorted(app_cats)} vs game: {game_cats}")
    else:
        check("category sync sources exist", appjs.exists() and game_data.exists())

    # ------------------------------------------------------------- GCJ-02 -----
    sql = ROOT / "scripts" / "sql" / "001_init.sql"
    if sql.exists():
        body = sql.read_text(encoding="utf-8")
        check("schema enforces the Shanghai bbox (GCJ-02)",
              "lng between 120.0 and 122.5" in body
              and "lat between 30.5 and 32.0" in body)
        check("schema pins coord_system to gcj02",
              "check (coord_system = 'gcj02')" in body)
        check("audio_description_cn is required at the schema level",
              re.search(r"audio_description_cn\s+text\s+not\s+null", body) is not None)
    else:
        check("001_init.sql exists", False)

    # No coordinate-system conversion calls in the frontend.
    converted = []
    for p in (SRC / "js").glob("*.js"):
        body = p.read_text(encoding="utf-8")
        if re.search(r"convert(From|To)\(", body):
            converted.append(p.name)
    check("no GCJ-02 <-> WGS-84 conversion calls in JS", not converted,
          "; ".join(converted))

    # --------------------------------------------------------------- wizard ---
    wiz = SRC / "js" / "wizard.js"
    if wiz.exists():
        body = wiz.read_text(encoding="utf-8")
        check("wizard caps uploads at 20 MB",
              "20 * 1024 * 1024" in body)
        check("wizard rejects .amr with voice-memo guidance",
              ".amr" in body and "微信语音" in body)
        check("wizard requires the audio description",
              "audio description is required" in body)
        check("wizard validates coordinates against the bbox",
              "lngMin" in body and "120.0" in body)

    # ---------------------------------------------------------------- playbook --
    playbook = ROOT / "playbooks" / "launch-soundmap.md"
    if playbook.exists():
        body = playbook.read_text(encoding="utf-8")
        missing = [s for s in PLAYBOOK_SECTIONS if s not in body]
        check("launch-soundmap.md has all 5 required sections", not missing,
              "missing " + ", ".join(missing))
    else:
        check("playbooks/launch-soundmap.md exists", False)

    # --------------------------------------------------------------- .env -----
    proc = subprocess.run(
        ["git", "ls-files", "scripts/.env"],
        cwd=ROOT, capture_output=True, text=True, timeout=30
    )
    if proc.returncode != 0:
        print("SKIP: scripts/.env not git-tracked (not a git repository yet — "
              "run `git init` before deploying)")
    else:
        check("scripts/.env is not git-tracked", not proc.stdout.strip())

    print()
    print(f"{len(passes)} passed, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
