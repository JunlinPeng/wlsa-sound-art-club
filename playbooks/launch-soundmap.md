# Playbook: Launch the Shanghai Sound Map

## Purpose

Bring the club's founding vision online: after execution,
`https://<user>.github.io/<repo>/` serves the **Shanghai Sound Map** — an AMap
(高德) centered on Shanghai with **zero pins** and a bilingual empty-state card
(v1 launches empty; the 65 placeholder Freesound mp3s are intentionally not
reused). Live and verified end to end:

- The member-submit → admin-approve loop (members sign up, admins approve the
  account, members submit sounds, admins approve/reject with a required note).
- The list mode and the 音频描述 (audio description) path for visually impaired
  children — the map is an enhancement, never the only path.
- Private storage: pending/rejected recordings are unreachable without a signed
  URL; only approved audio is ever served.
- `tests/check_soundmap.py`, `tests/check_rls.py`, `tests/check_seed.py`, and
  `scripts/smoke_test.py` all print PASS.

## Prerequisites

**Abort before Step 1 if any of these are missing** — the scripts error clearly,
but the items below need a human with the right accounts:

1. A **public GitHub repo** with this project pushed to `main` (the advisor's
   account, for continuity), Pages enabled (**Settings → Pages → Deploy from a
   branch → GitHub Actions**), and two repo **secrets** for keepalive
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` — see `.github/workflows/keepalive.yml`).
2. A **Supabase project** (Singapore region), with:
   - Email auth: **Settings → Auth → Providers → Email → disable "Confirm email"**.
   - The anon key, service key, and pooler connection string (Settings → API,
     Settings → Database).
3. An **AMap (高德) key** created by the advisor at lbs.amap.com (real-name
   verified, platform = **Web端 (JS API)**), plus its **securityJsCode**
   (安全密钥 — mandatory for keys issued after 2021-12-02), with domain
   whitelist (域名白名单): `<user>.github.io`, `127.0.0.1:8000`, `localhost:8000`.
4. PostgreSQL client tools (`psql`/`pg_dump`) on the machine running Steps 1–2
   and weekly backups.
5. `scripts/.env` filled in (copy `scripts/.env.example`; it is gitignored —
   **never commit the service key**).
6. A browser for the manual phone/laptop walk (Step 9).

## Steps

1. **Apply the schema**: `bash scripts/apply_schema.sh`
   (idempotent; creates `profiles`, `sounds`, the private `audio` bucket, all
   triggers and RLS policies, including the profiles.email backfill).
2. **Make the first admin**: `bash scripts/make_admin.sh <advisor-email>`
   (the account must already exist — sign up once on the site first).
3. **Fill in the public config**: edit `src/soundmap/config.js` with
   `AMAP_KEY`, `AMAP_SECURITY_CODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   (all public-by-design; the anon key is safe in a static bundle).
4. **Static checks**: `python tests/check_soundmap.py` and
   `python tests/check_seed.py` — both must exit 0 before pushing.
5. **RLS matrix** (the single most important check):
   `python tests/check_rls.py` — proves a crafted client cannot self-approve,
   self-promote, reject without a note, read pending rows, or upload audio with
   no matching row.
6. **Deploy**: push to `main`. The workflow runs the static checks, then
   `configure-pages → upload-pages-artifact → deploy-pages`. Confirm the
   Actions run is green and Pages shows the site URL.
7. **School-network smoke test**: `python scripts/smoke_test.py --url <site-url>`
   — verifies github.io + supabase.co reachability from mainland China.
8. **Promote the club roster**: `bash scripts/promote_members.sh
   <path-to-emails.csv>` (one email per line). Every member must still sign up
   once on the site so a profile row exists.
9. **Manual acceptance walk** (from a school phone and a laptop):
   - Open the site → centered AMap, zero pins, empty-state card, working list.
   - Sign up on the phone → bilingual "waiting for admin approval" screen.
   - Admin approves the account in `#/admin` → Members tab.
   - Phone records a voice memo (m4a) → member submits → admin approves on the
     laptop → the anonymous phone hears it from the map pin AND the list card.
   - Reject flow: bilingual note → member sees it → edit & resubmit → pending →
     approve.
   - Failure drills: revoke/rename the AMap key → map view shows the bilingual
     banner and redirects to `#/list` within ~4 s; stop Supabase → bilingual
     error, never a blank page; >20 MB or .amr upload → bilingual rejection.
10. **Schedule the weekly ops** (school machine or Actions):
    `python scripts/backup_soundmap.py --out backups/` and
    `python scripts/cleanup_orphan_audio.py` (dry run, then `--apply`).

## Expected Outcome

- The live URL shows the centered, drawn (non-satellite) Shanghai map with
  **zero pins** and the bilingual empty-state card — the locked v1 decision.
- `check_soundmap.py` / `check_seed.py` exit 0; `check_rls.py` prints an
  all-PASS matrix; `smoke_test.py` passes from the school network.
- Every destructive path is two-step and DB-enforced: self-approval impossible,
  reject requires a note, the last admin cannot be demoted, approved rows
  cannot point at `pending/` files.
- Unsigned bucket URLs return 403; signed URLs work for approved audio.
- Keepalive cron exists (Supabase free tier stays awake); backup zip contains
  the database dump + all audio objects.

## Rollback Plan

1. **Code rollback**: revert the last merge to `main` (previous deploy stays
   live; Pages redeploys the prior commit). The database changes in
   `001_init.sql` are additive and idempotent — they do not need reverting,
   but they can be reversed with a schema backup (`backup_soundmap.py`).
2. **github.io unreachable from the school network**: deploy the same static
   site to a Gitee Pages mirror (real-name verification required) and point
   the fair QR at it; the site is a static folder (`src/soundmap/`) with no
   build step, so the mirror is a copy-paste.
3. **Data**: restore from the weekly backup zip:
   `python scripts/backup_soundmap.py --restore backups/soundmap-<stamp>.zip`.
4. **Last resort**: disable Pages in repo settings (site goes dark, data and
   code remain intact).

### Directory Structure

```
project-root/
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
├── .github/workflows/
│   ├── deploy.yml              # verify -> Pages deploy (refuses to ship placeholders)
│   └── keepalive.yml           # weekly Supabase ping (free-tier pause guard)
├── playbooks/
│   └── launch-soundmap.md      # this file
├── scripts/
│   ├── sql/001_init.sql        # schema + triggers + RLS (idempotent)
│   ├── apply_schema.sh         # psql apply + verify tables/bucket
│   ├── make_admin.sh           # <email> -> role='admin'
│   ├── promote_members.sh      # CSV of emails -> role='member'
│   ├── seed_sounds.py          # bulk import + publish (December theme)
│   ├── data/sounds_seed.csv    # seed template (header-only; v1 is empty)
│   ├── data/sounds_seed.example.csv
│   ├── backup_soundmap.py      # pg_dump + storage download into a zip
│   ├── cleanup_orphan_audio.py # delete stray objects > 7 days (dry-run default)
│   ├── smoke_test.py           # school-network reachability + browser check
│   ├── serve.sh                # local dev server (AMap whitelist localhost)
│   ├── vendor_supabase.sh      # pinned supabase-js UMD vendor
│   ├── _supa.py                # shared stdlib Supabase REST client
│   └── .env.example            # credentials template (.env is gitignored)
├── src/soundmap/               # the deployable static site
│   ├── index.html              # shell, _AMapSecurityConfig BEFORE the loader
│   ├── config.js               # public keys (config.example.js = template)
│   ├── css/soundmap.css        # design system (palette + Fraunces/Inter)
│   ├── fonts/*.woff2           # vendored brand fonts
│   ├── vendor/supabase.min.js  # vendored supabase-js (no CDN)
│   └── js/{app,map,player,list,detail,wizard,admin,auth}.js
├── tests/
│   ├── check_soundmap.py       # static verifier (config/fonts/palette/sync/GCJ-02…)
│   ├── check_rls.py            # behavioral permission matrix (SKIPs without .env)
│   └── check_seed.py           # seed CSV validator (bbox/enums/required fields)
└── .tmp/                       # temp artifacts, never committed
```
