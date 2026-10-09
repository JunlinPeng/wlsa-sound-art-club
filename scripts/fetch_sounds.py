#!/usr/bin/env python3
"""Download Freesound previews for the Sound Blind Box game + generate sounds.js.

Reads src/game/data/sounds.json (the single source of truth), searches Freesound
for each entry's `query`, downloads the top-rated preview MP3 to
src/game/sounds/{id:02d}.mp3, and writes:

  - src/game/sounds.js      (window.SOUNDS manifest the game loads over file://)
  - src/game/sounds/review.json  (query -> Freesound id/name/license, for review)

Usage:
  python scripts/fetch_sounds.py --token <FREESOUND_API_KEY>
  # or set the FREESOUND_API_KEY environment variable.

  python scripts/fetch_sounds.py --generate-only   # only write sounds.js/review

Get a free API key at https://freesound.org/apiv2/apply/ (requires an account).
Stdlib only — no third-party dependencies.
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "game" / "data" / "sounds.json"
SOUNDS_DIR = ROOT / "src" / "game" / "sounds"
SOUNDS_JS = ROOT / "src" / "game" / "sounds.js"
REVIEW = SOUNDS_DIR / "review.json"

SEARCH = "https://freesound.org/apiv2/search/text/"
UA = {"User-Agent": "Mozilla/5.0 (Sound Blind Box game)"}


def search(token, query):
    params = urllib.parse.urlencode({
        "query": query,
        "token": token,
        "fields": "id,name,previews,license",
        "filter": "duration:[1.0 TO 30.0]",
        "page_size": 1,
        "sort": "rating_desc",
    })
    req = urllib.request.Request(SEARCH + "?" + params, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def download(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
        f.write(r.read())


def load_data():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


def gen_sounds_js(data):
    sounds = [{
        "id": s["id"],
        "en": s["en"],
        "cn": s["cn"],
        "category": s["category"],
        "file": "sounds/{:02d}.mp3".format(s["id"]),
    } for s in data["sounds"]]
    obj = {"categories": data["categories"], "sounds": sounds}
    js = "window.SOUNDS = " + json.dumps(obj, ensure_ascii=False, indent=2) + ";\n"
    SOUNDS_JS.write_text(js, encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--token", help="Freesound API key (or set FREESOUND_API_KEY)")
    ap.add_argument("--generate-only", action="store_true",
                    help="Only write sounds.js + review.json (no downloads)")
    args = ap.parse_args()

    data = load_data()
    sounds = data["sounds"]
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

    review = []
    ok = fail = 0

    if args.generate_only:
        print("Generating sounds.js + review.json only (no downloads).")
    else:
        token = args.token or os.environ.get("FREESOUND_API_KEY")
        if not token:
            sys.exit("ERROR: provide --token <FREESOUND_API_KEY> or set FREESOUND_API_KEY.")
        print("Downloading {} sounds from Freesound...".format(len(sounds)))

    for s in sounds:
        sid = s["id"]
        dest = SOUNDS_DIR / "{:02d}.mp3".format(sid)
        entry = {"id": sid, "en": s["en"], "cn": s["cn"], "query": s["query"]}

        if args.generate_only:
            review.append(entry)
            continue

        try:
            res = search(token, s["query"])
            results = res.get("results") or []
            if not results:
                entry["status"] = "no-results"
                review.append(entry)
                fail += 1
                print("  [{:02d}] {}: NO RESULTS for query '{}'".format(sid, s["en"], s["query"]))
                continue

            r = results[0]
            preview = (r.get("previews") or {}).get("preview-hq-mp3")
            if not preview:
                entry.update({"status": "no-preview", "freesound_id": r.get("id")})
                review.append(entry)
                fail += 1
                print("  [{:02d}] {}: NO PREVIEW (freesound #{})".format(sid, s["en"], r.get("id")))
                continue

            download(preview, dest)
            entry.update({
                "status": "ok",
                "freesound_id": r.get("id"),
                "freesound_name": r.get("name"),
                "license": r.get("license"),
                "url": preview,
            })
            review.append(entry)
            ok += 1
            print("  [{:02d}] {}: OK <- {}".format(sid, s["en"], r.get("name")))
            time.sleep(0.4)  # be polite to the API
        except Exception as e:  # noqa: BLE001
            entry["status"] = "error"
            entry["error"] = str(e)
            review.append(entry)
            fail += 1
            print("  [{:02d}] {}: ERROR {}".format(sid, s["en"], e))

    gen_sounds_js(data)
    REVIEW.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nDone. {} downloaded, {} failed, {} total.".format(ok, fail, len(sounds)))
    print("  sounds.js : {}".format(SOUNDS_JS))
    print("  review    : {}".format(REVIEW))


if __name__ == "__main__":
    main()
