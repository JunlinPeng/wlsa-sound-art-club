#!/usr/bin/env python3
"""Bulk-import sounds from a CSV into the Shanghai Sound Map (publishing them).

Usage:
    python scripts/seed_sounds.py --dry-run                     # validate only
    python scripts/seed_sounds.py                               # import + publish
    python scripts/seed_sounds.py --csv scripts/data/sounds_seed.csv

Each row becomes an APPROVED, public sound: insert a pending row (with a
client-chosen id), upload the audio to pending/<id>.<ext>, move the object to
approved/<id>.<ext>, then set status='approved'. A failed upload deletes its
row, so nothing is left stranded. Uses the SERVICE key from scripts/.env —
run tests/check_seed.py first (CI also runs it).

CSV columns (see scripts/data/sounds_seed.example.csv for sample rows):
    id,title_cn,title_en,category,time_of_day,recorded_on,lng,lat,place_cn,
    place_en,story_cn,story_en,transcript_cn,dialect_name,dialect_text,
    dialect_note,audio_description_cn,audio_description_en,recorder_name,
    license,audio_file
`id` may be empty (a UUID is generated); `audio_file` is a path relative to
the CSV's directory.
"""
import argparse
import csv
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _supa import service_client  # noqa: E402

CATEGORIES = {"transport", "cries", "market", "nature", "neighborhood",
              "festival", "daily", "crafts"}
TIME_OF_DAY = {"early_morning", "morning", "afternoon", "evening", "night"}
LICENSES = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "all-rights"}
LNG_MIN, LNG_MAX = 120.0, 122.5
LAT_MIN, LAT_MAX = 30.5, 32.0


def validate_row(row: dict, csv_dir: Path) -> list[str]:
    errors = []
    required = ["title_cn", "title_en", "category", "time_of_day", "recorded_on",
                "lng", "lat", "place_cn", "story_cn", "story_en", "transcript_cn",
                "audio_description_cn", "recorder_name", "license", "audio_file"]
    for col in required:
        if not (row.get(col) or "").strip():
            errors.append(f"missing '{col}'")
    if row.get("category") not in CATEGORIES:
        errors.append(f"bad category '{row.get('category')}'")
    if row.get("time_of_day") not in TIME_OF_DAY:
        errors.append(f"bad time_of_day '{row.get('time_of_day')}'")
    if row.get("license") not in LICENSES:
        errors.append(f"bad license '{row.get('license')}'")
    try:
        lng, lat = float(row["lng"]), float(row["lat"])
    except ValueError:
        errors.append("lng/lat are not numbers")
    else:
        if not (LNG_MIN <= lng <= LNG_MAX):
            errors.append(f"lng {lng} outside bbox")
        if not (LAT_MIN <= lat <= LAT_MAX):
            errors.append(f"lat {lat} outside bbox")
    if row.get("audio_file"):
        if not (csv_dir / row["audio_file"]).is_file():
            errors.append(f"audio_file '{row['audio_file']}' not found")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Shanghai Sound Map from a CSV.")
    parser.add_argument("--csv", default="scripts/data/sounds_seed.csv",
                        help="path to the seed CSV (default: scripts/data/sounds_seed.csv)")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate the CSV only; do not touch the database")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = (Path(__file__).resolve().parent.parent / csv_path).resolve()
    if not csv_path.exists():
        print(f"FAIL: {csv_path} not found")
        return 1

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("SKIP: the CSV has no data rows — nothing to import.")
        return 0

    bad = []
    for i, row in enumerate(rows, start=2):
        errs = validate_row(row, csv_path.parent)
        if errs:
            bad.append((i, errs))
    if bad:
        for i, errs in bad:
            print(f"FAIL: row {i}: " + "; ".join(errs))
        return 1
    print(f"PASS: {len(rows)} rows validated.")

    if args.dry_run:
        for row in rows:
            print(f"  would import: {row['title_en']} @ {row['place_cn']} "
                  f"({row['audio_file']})")
        print("Dry run — nothing was imported.")
        return 0

    sb = service_client()
    now = datetime.now(timezone.utc).isoformat()
    ok = fail = 0

    for i, row in enumerate(rows, start=2):
        sid = row.get("id") or str(uuid.uuid4())
        ext = Path(row["audio_file"]).suffix.lower().lstrip(".")
        pending_path = f"pending/{sid}.{ext}"
        approved_path = f"approved/{sid}.{ext}"

        payload = {
            "id": sid,
            "status": "pending",
            "title_cn": row["title_cn"].strip(),
            "title_en": row["title_en"].strip(),
            "category": row["category"],
            "time_of_day": row["time_of_day"],
            "recorded_on": row["recorded_on"],
            "lng": float(row["lng"]), "lat": float(row["lat"]),
            "coord_system": "gcj02",
            "place_cn": row["place_cn"].strip(),
            "place_en": (row.get("place_en") or "").strip() or None,
            "story_cn": row["story_cn"].strip(),
            "story_en": row["story_en"].strip(),
            "transcript_cn": row["transcript_cn"].strip(),
            "dialect_name": (row.get("dialect_name") or "").strip() or None,
            "dialect_text": (row.get("dialect_text") or "").strip() or None,
            "dialect_note": (row.get("dialect_note") or "").strip() or None,
            "audio_description_cn": row["audio_description_cn"].strip(),
            "audio_description_en": (row.get("audio_description_en") or "").strip() or None,
            "audio_path": pending_path,
            "recorder_name": row["recorder_name"].strip(),
            "license": row["license"],
        }

        label = f"row {i}: {row['title_en']}"
        try:
            st, body = sb.rest("POST", "sounds", payload, "select=id")
            if st >= 300:
                print(f"FAIL: {label} — insert failed ({st}): {str(body)[:160]}")
                fail += 1
                continue

            data = (csv_path.parent / row["audio_file"]).read_bytes()
            content_type = "audio/mpeg" if ext == "mp3" else "audio/mp4"
            st, body = sb.upload(pending_path, data, content_type=content_type)
            if st >= 300:
                sb.rest("DELETE", "sounds", query=f"id=eq.{sid}")  # no stranded row
                print(f"FAIL: {label} — upload failed ({st}): {str(body)[:160]}")
                fail += 1
                continue

            st, body = sb.move(pending_path, approved_path)
            if st >= 300:
                sb.rest("DELETE", "sounds", query=f"id=eq.{sid}")
                sb.remove(pending_path)
                print(f"FAIL: {label} — storage move failed ({st}): {str(body)[:160]}")
                fail += 1
                continue

            st, body = sb.rest("PATCH", "sounds",
                               {"status": "approved", "audio_path": approved_path,
                                "approved_at": now},
                               f"id=eq.{sid}")
            if st >= 300:
                # Roll the object back so the pending row keeps pointing at a
                # real file, then delete the row for a clean re-run.
                sb.move(approved_path, pending_path)
                sb.rest("DELETE", "sounds", query=f"id=eq.{sid}")
                print(f"FAIL: {label} — publish update failed ({st}): {str(body)[:160]}")
                fail += 1
                continue

            print(f"PASS: {label} — published")
            ok += 1
        except OSError as e:
            print(f"FAIL: {label} — {e}")
            fail += 1

    print()
    print(f"{ok} imported, {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
