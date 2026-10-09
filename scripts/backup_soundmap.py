#!/usr/bin/env python3
"""Backup (and restore) the Shanghai Sound Map: database + private audio bucket.

Backup:  python scripts/backup_soundmap.py [--out backups/]
Restore: python scripts/backup_soundmap.py --restore backups/soundmap-2026-12-01.zip

A backup zip contains:
    dump.sql            full pg_dump of the whole database (reference copy)
    public_data.sql     --data-only dump of the public schema — the RESTORABLE
                        part: profiles + sounds rows (+ triggers/policies stay
                        with the schema, applied by apply_schema.sh)
    audio/<object>      every object from the private 'audio' bucket

Restore is designed for "schema is applied (apply_schema.sh), data is gone":
it replays public_data.sql in one transaction and re-uploads the audio. Auth
users are NOT restored (a handful of club accounts re-sign up; make_admin.sh
re-promotes). Run weekly (see playbooks/launch-soundmap.md).
"""
import argparse
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _supa import require_env, service_client  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def list_all_objects(sb, prefix: str = "") -> list[dict]:
    """The list endpoint pages at 100 objects — walk it with offset.
    A failed page is a HARD failure: a backup that silently misses audio
    is worse than no backup."""
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


def run_psql(db_url: str, args: list[str]) -> int:
    proc = subprocess.run(["psql", db_url] + args,
                          capture_output=True, text=True, timeout=900)
    if proc.returncode != 0:
        print(f"FAIL: psql exited {proc.returncode}: {proc.stderr[:300]}")
    return proc.returncode


def do_backup(out_dir: Path) -> int:
    env = require_env()
    db_url = env.get("SUPABASE_DB_URL", "")
    if not db_url:
        print("FAIL: SUPABASE_DB_URL not set in scripts/.env (needed for pg_dump)")
        return 1

    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / f"soundmap-{stamp}.zip"
    tmp = out_dir / ".tmp-backup"
    tmp.mkdir(exist_ok=True)
    full_dump = tmp / "dump.sql"
    data_dump = tmp / "public_data.sql"

    try:
        print("Dumping the full database with pg_dump ...")
        with open(full_dump, "w", encoding="utf-8") as f:
            proc = subprocess.run(
                ["pg_dump", db_url, "--no-owner", "--no-privileges"],
                stdout=f, stderr=subprocess.PIPE, text=True, timeout=900)
        if proc.returncode != 0:
            print(f"FAIL: pg_dump exited {proc.returncode}: {proc.stderr[:300]}")
            print("      Install PostgreSQL client tools (pg_dump/psql) and retry.")
            return 1

        print("Dumping public-schema data (the restorable part) ...")
        with open(data_dump, "w", encoding="utf-8") as f:
            proc = subprocess.run(
                ["pg_dump", db_url, "--no-owner", "--no-privileges",
                 "--data-only", "--schema=public"],
                stdout=f, stderr=subprocess.PIPE, text=True, timeout=900)
        if proc.returncode != 0:
            print(f"FAIL: public data dump exited {proc.returncode}: {proc.stderr[:300]}")
            return 1

        sb = service_client()
        objects = list_all_objects(sb)
        print(f"Downloading {len(objects)} storage objects ...")
        downloaded = []
        for obj in objects:
            name = obj.get("name")
            if not name:
                continue
            st, data = sb.download(name)
            if st >= 300:
                print(f"FAIL: could not download {name} ({st})")
                return 1
            dest = tmp / "audio" / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            downloaded.append(name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(full_dump, "dump.sql")
            zf.write(data_dump, "public_data.sql")
            for name in downloaded:
                zf.write(tmp / "audio" / name, f"audio/{name}")

        print(f"PASS: backup written to {zip_path} "
              f"(database + {len(downloaded)} audio objects)")
        return 0
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def do_restore(zip_path: Path) -> int:
    env = require_env()
    db_url = env.get("SUPABASE_DB_URL", "")
    if not db_url:
        print("FAIL: SUPABASE_DB_URL not set in scripts/.env (needed for psql)")
        return 1

    tmp = zip_path.parent / ".tmp-restore"
    tmp.mkdir(exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            if "public_data.sql" not in names:
                print(f"FAIL: {zip_path} has no public_data.sql — not a soundmap backup")
                return 1
            zf.extractall(tmp)

        print("WARNING: this REPLACES the current public data (profiles + sounds).")
        print("Restoring public data in a single transaction ...")
        if run_psql(db_url, ["--single-transaction", "-v", "ON_ERROR_STOP=1",
                             "-f", str(tmp / "public_data.sql")]) != 0:
            print("      Make sure the schema is applied first: bash scripts/apply_schema.sh")
            return 1

        sb = service_client()
        audio_files = [n for n in names if n.startswith("audio/")]
        print(f"Re-uploading {len(audio_files)} storage objects ...")
        for name in audio_files:
            path = name[len("audio/"):]
            st, body = sb.upload(path, (tmp / name).read_bytes())
            if st >= 300:
                print(f"FAIL: re-upload of {path} failed ({st}): {str(body)[:160]}")
                return 1

        print(f"PASS: restored public data + {len(audio_files)} audio objects from {zip_path}")
        return 0
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup/restore the sound map (DB + audio).")
    parser.add_argument("--out", default="backups", help="backup directory (default: backups/)")
    parser.add_argument("--restore", metavar="ZIP", help="restore from a backup zip")
    args = parser.parse_args()

    if args.restore:
        return do_restore(Path(args.restore))
    return do_backup(ROOT / args.out)


if __name__ == "__main__":
    sys.exit(main())
