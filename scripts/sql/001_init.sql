-- ============================================================================
-- WLSA Sound Art Club — Shanghai Sound Map: Supabase schema (idempotent)
-- Apply with:  bash scripts/apply_schema.sh   (see playbooks/launch-soundmap.md)
--
-- Design rules encoded here:
--   * GCJ-02 ONLY. Store exactly what AMap click/PlaceSearch returns, NEVER
--     convert, NEVER feed phone-GPS (WGS-84) values. The lng/lat CHECKs catch
--     swapped pairs and WGS-84 mixups (WGS-84 Shanghai sits outside the bbox).
--   * The audio file's folder mirrors the row status: pending/<id>.<ext> for
--     pending/rejected, approved/<id>.<ext> for approved. A trigger enforces
--     it — approving a row whose file is still in pending/ raises an error
--     (run the storage move first, then UPDATE the status).
--   * Approval integrity lives here, not in the UI: inserts are forced to
--     status='pending', member edits reset to pending, self-promotion is
--     impossible, rejection requires a review note. A crafted client cannot
--     self-approve.
--   * Category list must stay in sync with src/game/data/sounds.json —
--     tests/check_soundmap.py fails the build if it drifts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage bucket: private. Pending/rejected recordings are unreachable without
-- a signed URL; only approved audio is ever served to the public.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user; role gates everything.
-- 'pending'  = signed up, admin has not approved the account yet (grants nothing)
-- 'member'   = club member: can submit sounds
-- 'admin'    = club admin: review queue + full management
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'pending'
               check (role in ('pending', 'member', 'admin')),
  display_name text,
  email        text,  -- denormalized from auth.users so the admin Members tab
                      -- can list contact info without service-role access
  created_at   timestamptz not null default now()
);

-- Idempotent migration for databases created before the email column existed.
alter table public.profiles add column if not exists email text;

alter table public.profiles enable row level security;

-- Auto-create a 'pending' profile on signup (security definer — the client
-- never writes profiles for new users; junk signup accounts grant nothing).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, email)
  values (new.id, 'pending', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill emails for profiles created before the email column existed.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email <> u.email);

-- Role check helper (security definer: safe to call from RLS policies and
-- storage policies, which run as the requesting role).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- sounds — one row = one sound at one place.
-- ----------------------------------------------------------------------------
create table if not exists public.sounds (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),

  -- identity
  title_cn    text not null,
  title_en    text not null,

  -- theme: keep in sync with src/game/data/sounds.json (tests enforce)
  category    text not null
              check (category in ('transport', 'cries', 'market', 'nature',
                                  'neighborhood', 'festival', 'daily', 'crafts')),
  -- "Hearing a Day in Shanghai" slot
  time_of_day text not null
              check (time_of_day in ('early_morning', 'morning', 'afternoon',
                                     'evening', 'night')),
  recorded_on date not null,  -- Shanghai local date; the slot carries time-of-day

  -- location: GCJ-02 ONLY (see header comment)
  lng          numeric(10, 7) not null
               check (lng between 120.0 and 122.5),  -- Shanghai bbox
  lat          numeric(10, 7) not null
               check (lat between 30.5 and 32.0),
  coord_system text not null default 'gcj02'
               check (coord_system = 'gcj02'),
  place_cn     text not null,  -- reverse-geocoded from AMap, editable
  place_en     text,

  -- story
  story_cn     text not null,
  story_en     text not null,
  transcript_cn text not null,  -- required Mandarin transcript

  -- dialect (optional)
  dialect_name text,
  dialect_text text,
  dialect_note text,

  -- accessibility: REQUIRED description written for visually impaired children
  -- (read aloud on the detail page via the Web Speech API)
  audio_description_cn text not null,
  audio_description_en text,

  -- audio: folder mirrors status — 'pending/<id>.<ext>' then 'approved/<id>.<ext>'
  audio_path   text not null
               check (audio_path ~ '^(pending|approved)/.+\.(mp3|m4a)$'),

  -- attribution
  recorder_name text not null,  -- denormalized: survives account deletion
  license      text not null
               check (license in ('cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc',
                                  'cc-by-nc-sa', 'all-rights')),
  submitted_by uuid references auth.users (id) on delete set null,

  -- review bookkeeping
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id) on delete set null,
  review_note  text  -- REQUIRED bilingual note when rejecting (admin policy enforces)
);

alter table public.sounds enable row level security;

create index if not exists sounds_status_idx on public.sounds (status);
create index if not exists sounds_submitted_by_idx on public.sounds (submitted_by);
create index if not exists sounds_category_idx on public.sounds (category);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sounds_set_updated_at on public.sounds;
create trigger sounds_set_updated_at
  before update on public.sounds
  for each row execute function public.set_updated_at();

-- Enforce the audio-path / status mirror (see header comment), and bind the
-- path stem to the row's OWN id: a row can never point at another row's file
-- (this is what keeps the review audit trail honest). The stem check also
-- rejects 'pending/../approved/…' style paths outright.
create or replace function public.enforce_audio_folder()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('pending', 'rejected') and new.audio_path not like 'pending/%' then
    raise exception 'AUDIO_FOLDER_MISMATCH: pending rows must point at pending/<id>.<ext>';
  end if;
  if new.status = 'approved' and new.audio_path not like 'approved/%' then
    raise exception 'AUDIO_FOLDER_MISMATCH: move the storage object to approved/ BEFORE setting status=approved';
  end if;
  if split_part(split_part(new.audio_path, '/', 2), '.', 1) <> new.id::text then
    raise exception 'AUDIO_PATH_MISMATCH: audio_path must be <folder>/<row-id>.<ext>';
  end if;
  return new;
end;
$$;

drop trigger if exists sounds_enforce_audio_folder on public.sounds;
create trigger sounds_enforce_audio_folder
  before insert or update of status, audio_path on public.sounds
  for each row execute function public.enforce_audio_folder();

-- Bound junk-account storage burn: max 5 pending rows per submitter
-- (admins exempt — they publish immediately).
create or replace function public.enforce_pending_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() and (
    select count(*) from public.sounds s
    where s.submitted_by = new.submitted_by and s.status = 'pending'
  ) >= 5 then
    raise exception 'TOO_MANY_PENDING: you already have 5 pending submissions';
  end if;
  return new;
end;
$$;

drop trigger if exists sounds_enforce_pending_limit on public.sounds;
create trigger sounds_enforce_pending_limit
  before insert on public.sounds
  for each row execute function public.enforce_pending_limit();

-- Never lock the club out: the last admin cannot be demoted or deleted.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'LAST_ADMIN: the final admin cannot be demoted or removed';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_guard_last_admin on public.profiles;
create trigger profiles_guard_last_admin
  before update of role or delete on public.profiles
  for each row execute function public.guard_last_admin();

-- ----------------------------------------------------------------------------
-- RLS policies: sounds
-- ----------------------------------------------------------------------------
drop policy if exists "anon read approved" on public.sounds;
create policy "anon read approved" on public.sounds
  for select to anon
  using (status = 'approved');

drop policy if exists "members read approved and own" on public.sounds;
create policy "members read approved and own" on public.sounds
  for select to authenticated
  using (status = 'approved' or submitted_by = auth.uid() or public.is_admin());

-- Everyone inserts as pending; publish is a separate, later action.
-- Self-approval is impossible even from a crafted client.
drop policy if exists "insert as pending" on public.sounds;
create policy "insert as pending" on public.sounds
  for insert to authenticated
  with check (
    status = 'pending'
    and (submitted_by = auth.uid() or public.is_admin())
  );

-- Member edits own drafts; ANY save resets the row to pending (the resubmit
-- rule). Approved rows are untouchable by members.
drop policy if exists "member update own draft" on public.sounds;
create policy "member update own draft" on public.sounds
  for update to authenticated
  using (
    submitted_by = auth.uid()
    and status in ('pending', 'rejected')
    and not public.is_admin()
  )
  with check (
    submitted_by = auth.uid()
    and status = 'pending'
  );

-- Admin updates anything; rejecting REQUIRES a review note (DB-enforced).
drop policy if exists "admin update any" on public.sounds;
create policy "admin update any" on public.sounds
  for update to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and (status <> 'rejected' or (review_note is not null and length(review_note) > 0))
  );

drop policy if exists "member delete own draft" on public.sounds;
create policy "member delete own draft" on public.sounds
  for delete to authenticated
  using (
    submitted_by = auth.uid()
    and status in ('pending', 'rejected')
    and not public.is_admin()
  );

drop policy if exists "admin delete any" on public.sounds;
create policy "admin delete any" on public.sounds
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- RLS policies: profiles
-- ----------------------------------------------------------------------------
drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles insert self pending" on public.profiles;
create policy "profiles insert self pending" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'pending');

-- Self-update cannot change own role (no self-promotion); admins edit anyone.
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()))
  );

drop policy if exists "profiles delete admin" on public.profiles;
create policy "profiles delete admin" on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- RLS policies: storage.objects (bucket 'audio' only — policies are per-object
-- and must re-check bucket_id)
-- ----------------------------------------------------------------------------
-- NOTE: we do NOT run `alter table storage.objects enable row level security`
-- here. That table is owned by supabase_storage_admin, so the `postgres` role
-- the SQL Editor runs as gets "42501: must be owner of table objects" — and
-- Supabase already enables RLS on storage.objects by default, so the statement
-- is unnecessary anyway. The policies below are what actually matter.
--
-- NOTE: every ownership check below casts `auth.uid()::text`. Supabase declares
-- storage.objects.owner_id as TEXT while auth.uid() returns UUID, and Postgres
-- has no implicit uuid = text operator — omitting the cast fails policy creation
-- with "42883: operator does not exist: text = uuid". Cast the uid, never the
-- column: casting a column that might hold a non-uuid value would raise instead.

drop policy if exists "audio select approved or own" on storage.objects;
create policy "audio select approved or own" on storage.objects
  for select
  using (
    bucket_id = 'audio'
    and (
      (storage.foldername(name))[1] = 'approved'
      or owner_id = auth.uid()::text
      or public.is_admin()  -- admins preview pending/rejected audio for review
    )
  );

drop policy if exists "audio insert own pending or admin" on storage.objects;
create policy "audio insert own pending or admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio'
    and storage.extension(name) in ('mp3', 'm4a')
    and (
      -- admins may upload/move anywhere (rows are still RLS-protected)
      public.is_admin()
      or (
        (storage.foldername(name))[1] = 'pending'
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('member', 'admin')
        )
        and exists (
          -- the filename stem must match the uploader's own pending/rejected
          -- row (rejected rows still hold their file in pending/, and a
          -- resubmit may replace it before the row flips back to pending)
          select 1 from public.sounds s
          where split_part(storage.filename(name), '.', 1) = s.id::text
            and s.submitted_by = auth.uid()
            and s.status in ('pending', 'rejected')
        )
      )
    )
  );

drop policy if exists "audio update own or admin" on storage.objects;
create policy "audio update own or admin" on storage.objects
  for update
  using (bucket_id = 'audio' and (owner_id = auth.uid()::text or public.is_admin()))
  with check (
    bucket_id = 'audio'
    and (
      public.is_admin()
      or (
        owner_id = auth.uid()::text
        -- Non-admin owners may only rename their own object WITHIN pending/ —
        -- this blocks a move/update that smuggles unapproved audio into the
        -- publicly readable approved/ folder, whichever storage backend
        -- implements the move.
        and (storage.foldername(name))[1] = 'pending'
      )
    )
  );

drop policy if exists "audio delete own or admin" on storage.objects;
create policy "audio delete own or admin" on storage.objects
  for delete
  using (
    bucket_id = 'audio'
    and (
      public.is_admin()
      or (
        owner_id = auth.uid()::text
        -- Members own their uploads forever (owner_id never changes), but once
        -- an object is approved and moved to approved/ it is a published club
        -- asset — only admins may remove it there.
        and (storage.foldername(name))[1] = 'pending'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant select on public.sounds to anon, authenticated;
grant insert, update, delete on public.sounds to authenticated;
