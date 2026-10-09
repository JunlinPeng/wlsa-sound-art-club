# Changelog

Notable changes to the WLSA Sound Art Club project, newest first.

## 2026-10-09 — Shanghai Sound Map (v1)

- **feat:** `src/soundmap/` — a static, bilingual (EN + 中文) sound-map web app:
  AMap (高德) vector map of Shanghai, list mode, story/detail pages with the
  音频描述 read aloud for visually impaired children, a single global player,
  and a member-submit → admin-approve loop (3-step wizard, review queue,
  members management). No build step; supabase-js is vendored (no CDN).
- **feat:** Supabase schema `scripts/sql/001_init.sql` — `profiles` + `sounds`
  tables, private `audio` bucket, folder↔status mirror trigger, 5-pending-row
  limit, last-admin guard, and full RLS (self-approval impossible, reject
  requires a bilingual note, GCJ-02 bbox CHECKs).
- **feat:** Ops tooling — `apply_schema.sh`, `make_admin.sh`,
  `promote_members.sh`, `seed_sounds.py`, `backup_soundmap.py`,
  `cleanup_orphan_audio.py`, `smoke_test.py`, `serve.sh`, `vendor_supabase.sh`.
- **feat:** Verification — `tests/check_soundmap.py` (static),
  `tests/check_rls.py` (behavioral permission matrix), `tests/check_seed.py`.
- **feat:** CI/CD — `deploy.yml` (static checks gate a GitHub Pages deploy) and
  `keepalive.yml` (weekly Supabase ping against the free-tier 7-day pause).
- **docs:** `playbooks/launch-soundmap.md` (5-section launch playbook), README
  section, and this changelog.

v1 launches **empty** by design — the 65 Freesound placeholder mp3s from the
booth game are not reused (they are not real Shanghai recordings). The first
content drop is the December "Hearing a Day in Shanghai" theme (20–30 sounds),
imported with `scripts/seed_sounds.py`.

## 2026-09 — CCA Fair kit & first meeting

- Poster (A2 @ 300 dpi), 2 cm club stamp, round badge, Sound Blind Box game
  card + pitch card, the 65-sound web game, and the first-meeting deck.
