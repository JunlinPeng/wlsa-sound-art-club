#!/usr/bin/env python3
"""Validate the sounds seed CSV for scripts/seed_sounds.py.

Club style: prints PASS:/FAIL: lines, returns 0 only if every check passes.
Usage: python tests/check_seed.py [path.csv]   (default: scripts/data/sounds_seed.csv)

Rules enforced (mirroring the DB CHECKs, so a bad row can never reach the
database):
  * header columns match exactly
  * category / time_of_day / license enums
  * recorded_on is YYYY-MM-DD
  * lng/lat are inside the Shanghai GCJ-02 bbox (lng 120.0-122.5, lat 30.5-32.0)
  * required text fields are non-empty
  * audio_file exists on disk (skipped for *.example.csv)
"""
import csv
import re
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252

ROOT = Path(__file__).resolve().parent.parent

COLUMNS = [
    "id", "title_cn", "title_en", "category", "time_of_day", "recorded_on",
    "lng", "lat", "place_cn", "place_en", "story_cn", "story_en",
    "transcript_cn", "dialect_name", "dialect_text", "dialect_note",
    "audio_description_cn", "audio_description_en", "recorder_name",
    "license", "audio_file",
]

REQUIRED = ["title_cn", "title_en", "category", "time_of_day", "recorded_on",
            "lng", "lat", "place_cn", "story_cn", "story_en", "transcript_cn",
            "audio_description_cn", "recorder_name", "license", "audio_file"]

CATEGORIES = {"transport", "cries", "market", "nature", "neighborhood",
              "festival", "daily", "crafts"}
TIME_OF_DAY = {"early_morning", "morning", "afternoon", "evening", "night"}
LICENSES = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "all-rights"}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LNG_MIN, LNG_MAX = 120.0, 122.5
LAT_MIN, LAT_MAX = 30.5, 32.0


def main() -> int:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts" / "data" / "sounds_seed.csv"
    failures = []
    passes = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        if ok:
            passes.append(label)
            print(f"PASS: {label}")
        else:
            failures.append(label)
            print(f"FAIL: {label}" + (f" — {detail}" if detail else ""))

    if not csv_path.exists():
        print(f"FAIL: {csv_path} not found")
        return 1

    check_audio_files = not csv_path.name.endswith(".example.csv")

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            header = []

    check("header matches the expected columns", header == COLUMNS,
          f"expected {COLUMNS}")

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        # v1 launches EMPTY — a header-only CSV is a valid state. Seeding
        # happens in December ("Hearing a Day in Shanghai", 20-30 rows).
        print("PASS: header-only seed CSV (v1 launches empty; add rows before "
              "running scripts/seed_sounds.py)")
        print("1 passed, 0 failed")
        return 0

    row_errors = []
    seen_ids = set()
    for i, row in enumerate(rows, start=2):
        def bad(msg: str) -> None:
            row_errors.append(f"row {i}: {msg}")

        for col in REQUIRED:
            if not (row.get(col) or "").strip():
                bad(f"missing required field '{col}'")
        if (row.get("id") or "").strip():
            try:
                row_id = str(uuid.UUID(row["id"].strip()))
            except ValueError:
                bad(f"id '{row['id']}' is not a valid UUID")
            else:
                if row_id in seen_ids:
                    bad(f"duplicate id '{row['id']}'")
                seen_ids.add(row_id)
        if row.get("audio_file"):
            ext = Path(row["audio_file"]).suffix.lower()
            if ext not in (".mp3", ".m4a"):
                bad(f"audio_file '{row['audio_file']}' is not .mp3/.m4a")
        if row.get("category") not in CATEGORIES:
            bad(f"category '{row.get('category')}' not in {sorted(CATEGORIES)}")
        if row.get("time_of_day") not in TIME_OF_DAY:
            bad(f"time_of_day '{row.get('time_of_day')}' not in {sorted(TIME_OF_DAY)}")
        if row.get("license") not in LICENSES:
            bad(f"license '{row.get('license')}' not in {sorted(LICENSES)}")
        if not DATE_RE.match(row.get("recorded_on", "")):
            bad(f"recorded_on '{row.get('recorded_on')}' is not YYYY-MM-DD")
        try:
            lng, lat = float(row["lng"]), float(row["lat"])
        except ValueError:
            bad(f"lng/lat are not numbers ('{row.get('lng')}', '{row.get('lat')}')")
        else:
            if not (LNG_MIN <= lng <= LNG_MAX):
                bad(f"lng {lng} outside Shanghai bbox ({LNG_MIN}-{LNG_MAX})")
            if not (LAT_MIN <= lat <= LAT_MAX):
                bad(f"lat {lat} outside Shanghai bbox ({LAT_MIN}-{LAT_MAX})")
        if check_audio_files and row.get("audio_file"):
            audio = (csv_path.parent / row["audio_file"]).resolve()
            if not audio.is_file():
                bad(f"audio_file '{row['audio_file']}' not found at {audio}")

    check("every row passes validation", not row_errors)
    for err in row_errors[:20]:
        print(f"      {err}")
    if len(row_errors) > 20:
        print(f"      … and {len(row_errors) - 20} more")

    print()
    print(f"{len(passes)} passed, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
