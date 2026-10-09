#!/usr/bin/env python3
"""Find and (optionally) delete orphaned audio objects in the 'audio' bucket.

An object is an orphan when it has no matching sounds row, or its folder no
longer mirrors the row's status (the DB trigger enforces the mirror on rows;
stray objects from failed uploads / withdrawn submissions accumulate instead).

Usage:
    python scripts/cleanup_orphan_audio.py                # dry run (default)
    python scripts/cleanup_orphan_audio.py --apply        # actually delete
    python scripts/cleanup_orphan_audio.py --min-age-days 7   (default 7)

Only objects older than --min-age-days are touched, so a fresh submission
mid-upload is never deleted. Run weekly (see playbooks/launch-soundmap.md).
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _supa import service_client  # noqa: E402


def list_all_objects(sb, prefix: str = "") -> list[dict]:
    """A failed page is a HARD failure — cleanup must never run blind."""
    objects, offset = [], 0
    while True:
        st, body = sb.request("GET",
                              f"/storage/v1/object/list/audio?prefix={prefix}&limit=100&offset={offset}")
        if st >= 300:
            raise RuntimeError(f"storage list failed ({st}): {str(body)[:200]}")
        if not isinstance(body, list) or not body:
            break
        objects.extend(body)
        if len(body) < 100:
            break
        offset += 100
    return objects


def parse_iso(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean up orphaned sound-map audio objects.")
    parser.add_argument("--apply", action="store_true",
                        help="delete the orphaned objects (default: dry run only)")
    parser.add_argument("--min-age-days", type=int, default=7,
                        help="only consider objects older than this many days (default 7)")
    args = parser.parse_args()

    sb = service_client()

    print("Loading all sounds rows ...")
    st, rows = sb.rest("GET", "sounds", query="select=id,status,audio_path")
    if st >= 300 or not isinstance(rows, list):
        print(f"FAIL: could not load sounds rows ({st}): {str(rows)[:160]}")
        return 1
    by_id = {r["id"]: r for r in rows}
    print(f"  {len(rows)} rows loaded.")

    print("Listing storage objects ...")
    try:
        objects = list_all_objects(sb)
    except RuntimeError as e:
        print(f"FAIL: {e}")
        return 1
    print(f"  {len(objects)} objects found.")

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.min_age_days)
    orphans, too_young, skipped_parse = [], [], []

    for obj in objects:
        name = obj.get("name") or ""
        parts = name.split("/")
        folder = parts[0] if parts else ""
        stem = Path(parts[-1]).stem if parts else ""
        created = parse_iso(obj.get("created_at"))

        row = by_id.get(stem)
        if row is None:
            problem = "no matching row"
        elif row["audio_path"] != name:
            problem = f"path mismatch (row says {row['audio_path']})"
        elif folder == "approved" and row["status"] != "approved":
            problem = f"approved/ object but row status is {row['status']}"
        elif folder == "pending" and row["status"] not in ("pending", "rejected"):
            problem = f"pending/ object but row status is {row['status']}"
        else:
            continue  # healthy

        if not created:
            skipped_parse.append((name, problem))
            continue
        if created < cutoff:
            orphans.append((name, problem))
        else:
            too_young.append((name, problem))

    print()
    print(f"  orphans (>= {args.min_age_days} days old): {len(orphans)}")
    print(f"  suspicious but too young:               {len(too_young)}")
    print(f"  suspicious, unparseable date:           {len(skipped_parse)}")

    if not orphans:
        print("PASS: nothing to clean up.")
        return 0

    for name, problem in orphans:
        print(f"  orphan: {name} — {problem}")

    if not args.apply:
        print("Dry run — pass --apply to delete these objects.")
        return 0

    deleted = failed = 0
    for name, _ in orphans:
        st, body = sb.remove(name)
        if st < 300:
            print(f"  deleted: {name}")
            deleted += 1
        else:
            print(f"FAIL: delete {name} failed ({st}): {str(body)[:160]}")
            failed += 1

    print()
    print(f"{deleted} deleted, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
