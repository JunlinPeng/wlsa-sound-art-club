#!/usr/bin/env python3
"""Behavioral RLS permission matrix for the Shanghai Sound Map.

The single most important check: prove that a crafted client cannot
self-approve, self-promote, reject without a note, read pending rows as anon,
smuggle unapproved audio into the public approved/ folder, point a row at
someone else's file, or delete a published recording.

Talks to Supabase REST directly (stdlib only — no SDK, no dependencies).
Credentials come from scripts/.env (gitignored). When they are absent the
test SKIPs cleanly (CI-safe); when present, every line must PASS.

PostgREST semantics encoded here:
  * WITH CHECK violations (self-approve, bad insert) -> 400-class error
  * USING failures (editing rows RLS hides) -> 2xx with ZERO rows affected
Test users, rows, and objects are created with the SERVICE key and deleted
afterwards.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / "scripts" / ".env"

BUCKET = "audio"
FIXED_APPROVED = "00000000-0000-4000-8000-000000000001"
FIXED_PENDING = "00000000-0000-4000-8000-000000000002"
OTHER_UUID = "00000000-0000-4000-8000-000000000099"


def load_env(path: Path) -> dict:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


class Client:
    """Minimal Supabase REST/storage/auth client."""

    def __init__(self, url: str, key: str, token: str | None = None):
        self.url = url.rstrip("/")
        self.key = key
        self.token = token

    def headers(self, extra: dict | None = None) -> dict:
        h = {"apikey": self.key}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if extra:
            h.update(extra)
        return h

    def request(self, method: str, path: str, body=None, headers: dict | None = None,
                raw: bytes | None = None):
        req = urllib.request.Request(self.url + path, method=method,
                                     headers=self.headers(headers))
        if raw is not None:
            req.data = raw
        elif body is not None:
            req.data = json.dumps(body).encode("utf-8")
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                return resp.status, json.loads(data) if data else None
        except urllib.error.HTTPError as e:
            data = e.read()
            try:
                return e.code, json.loads(data)
            except ValueError:
                return e.code, {"raw": data.decode("utf-8", "replace")[:200]}

    # PostgREST ---------------------------------------------------------------
    def rest(self, method: str, table: str, body=None, query: str = ""):
        # Guard against the mistake that made two checks here meaningless: a
        # query string passed positionally lands in `body`, the filter is
        # dropped, and the request quietly returns EVERY row. The checks then
        # assert against body[0] — an arbitrary row — and pass or fail by luck.
        # (The admin promotion check passed only because the first row returned
        # happened to be the human admin's own profile.)
        if isinstance(body, str):
            raise TypeError(
                f"rest({method!r}, {table!r}) received a query string as `body`: {body!r}. "
                f"Pass it as query={body!r} instead."
            )
        path = f"/rest/v1/{table}"
        if query:
            path += "?" + query
        # PostgREST answers a write with an EMPTY body unless you ask for the row
        # back, so every `body[0]` after an insert/update below exploded with
        # "NoneType is not subscriptable". (A write blocked by a WITH CHECK
        # policy has no rows to return and comes back as [], which the checks
        # allow for explicitly.)
        headers = {"Prefer": "return=representation"} if method != "GET" else None
        return self.request(method, path, body=body, headers=headers)

    # Storage -------------------------------------------------------------------
    def upload(self, path: str, data: bytes):
        return self.request("PUT", f"/storage/v1/object/{BUCKET}/{path}", raw=data,
                            headers={"Content-Type": "audio/mpeg"})

    def remove(self, path: str):
        return self.request("DELETE", f"/storage/v1/object/{BUCKET}/{path}")

    def list_objects(self, prefix: str = ""):
        q = urllib.parse.quote(prefix, safe="")
        return self.request("GET", f"/storage/v1/object/list/{BUCKET}?prefix={q}")

    def move(self, source: str, destination: str):
        return self.request("POST", "/storage/v1/object/move",
                            body={"bucketId": BUCKET, "sourceKey": source,
                                  "destinationKey": destination})

    def sign(self, path: str):
        return self.request("POST", f"/storage/v1/object/sign/{BUCKET}/{path}",
                            body={"expiresIn": 60})

    # Auth admin API (service key only) -------------------------------------
    def admin_create_user(self, email: str, password: str):
        return self.request("POST", "/auth/v1/admin/users",
                            body={"email": email, "password": password,
                                  "email_confirm": True})

    def admin_delete_user(self, user_id: str):
        return self.request("DELETE", f"/auth/v1/admin/users/{user_id}")

    def sign_in(self, email: str, password: str):
        return self.request("POST", "/auth/v1/token?grant_type=password",
                            body={"email": email, "password": password})


def sound_row(title: str, status: str, audio_path: str, extra: dict | None = None) -> dict:
    row = {
        "title_cn": "测试声音", "title_en": title,
        "category": "nature", "time_of_day": "morning",
        "recorded_on": "2026-10-09", "lng": 121.4737, "lat": 31.2304,
        "coord_system": "gcj02", "place_cn": "测试地点",
        "story_cn": "测试故事", "story_en": "test story",
        "transcript_cn": "测试文字稿", "audio_description_cn": "给视障小朋友的测试描述",
        "audio_description_en": "test description", "recorder_name": "RLS check",
        "license": "cc-by-sa", "status": status, "audio_path": audio_path,
    }
    if extra:
        row.update(extra)
    return row


def main() -> int:
    env = load_env(ENV_PATH)
    url = env.get("SUPABASE_URL", "")
    anon_key = env.get("SUPABASE_ANON_KEY", "")
    service_key = env.get("SUPABASE_SERVICE_KEY", "")
    if not (url and anon_key and service_key):
        print("SKIP: scripts/.env credentials absent — this matrix runs during launch "
              "(see playbooks/launch-soundmap.md), not in CI.")
        return 0

    # The service key goes in BOTH places. PostgREST is happy with `apikey`
    # alone, but the Auth admin API (/auth/v1/admin/users) rejects `apikey`-only
    # requests with 401 no_authorization — "This endpoint requires a valid Bearer
    # token". Passing it as the token too is the documented pattern and is what
    # makes the test-user setup below work at all.
    svc = Client(url, service_key, service_key)
    anon = Client(url, anon_key)

    results = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'}: {label}" + (f" — {detail}" if detail else ""))

    def hard(label: str, st: int, body) -> bool:
        """Setup step that must succeed or the whole matrix is invalid."""
        ok = st < 300
        check(label, ok, f"status {st} {str(body)[:120]}")
        return ok

    stamp = str(int(time.time()))
    member_email = f"wlsa-check-member-{stamp}@example.com"
    admin_email = f"wlsa-check-admin-{stamp}@example.com"
    password = "check-rls-12345"
    member_id = admin_id = None
    member_token = admin_token = None
    created_rows = []
    created_objects = []

    def cleanup():
        # Reuse `svc` rather than building a fresh client: a copy made here would
        # again lack the bearer token, and admin_delete_user would 401 — leaving
        # test accounts behind on every run, each with a known password. The
        # return values are ignored, so that failure is completely silent.
        for oid in created_rows:
            svc.rest("DELETE", "sounds", query=f"id=eq.{oid}")
        for obj in created_objects:
            svc.remove(obj)
        # Demote the test admin first so guard_last_admin can never block the
        # user deletion (and never leaves a live admin with a known password).
        if admin_id:
            svc.rest("PATCH", "profiles", {"role": "member"}, f"id=eq.{admin_id}")
        for uid in (member_id, admin_id):
            if uid:
                svc.admin_delete_user(uid)

    try:
        # ---------------------------------------------------------- users ----
        st, body = svc.admin_create_user(member_email, password)
        if not hard("create member test user", st, body):
            return 1
        member_id = body["id"]

        st, body = svc.admin_create_user(admin_email, password)
        if not hard("create admin test user", st, body):
            return 1
        admin_id = body["id"]

        st, body = svc.rest("PATCH", "profiles", {"role": "admin"}, f"id=eq.{admin_id}")
        if not hard("promote admin test user", st, body):
            return 1
        st, body = svc.rest("GET", "profiles", query=f"id=eq.{admin_id}&select=role")
        check("admin promotion took effect",
              st == 200 and body and body[0]["role"] == "admin", str(body)[:120])

        st, body = svc.rest("PATCH", "profiles", {"role": "member"}, f"id=eq.{member_id}")
        if not hard("promote member test user", st, body):
            return 1
        st, body = svc.rest("GET", "profiles", query=f"id=eq.{member_id}&select=role")
        check("member promotion took effect",
              st == 200 and body and body[0]["role"] == "member", str(body)[:120])

        st, body = anon.rest("GET", "profiles", query="select=id&limit=1")
        # anon has no SELECT policy on profiles, and PostgREST expresses an RLS
        # USING failure as a 2xx with ZERO rows — not a 4xx. So "denied" here
        # means 200 + an empty list; demanding >= 400 fails a healthy backend.
        # What must never happen is rows coming back.
        leaked = [r for r in body] if isinstance(body, list) else []
        check("anon cannot read profiles", st >= 400 or (st == 200 and not leaked),
              f"status {st}, rows={len(leaked) if isinstance(body, list) else body!r}")

        st, body = Client(url, anon_key).sign_in(member_email, password)
        check("member signs in", st == 200 and bool(body.get("access_token")), f"status {st}")
        member_token = body.get("access_token")
        st, body = Client(url, anon_key).sign_in(admin_email, password)
        check("admin signs in", st == 200 and bool(body.get("access_token")), f"status {st}")
        admin_token = body.get("access_token")

        member = Client(url, anon_key, member_token)
        admin = Client(url, anon_key, admin_token)

        # ---------------------------------------------------------- rows ----
        approved_row = sound_row("RLS test sound", "approved",
                                 f"approved/{FIXED_APPROVED}.mp3",
                                 {"id": FIXED_APPROVED})
        pending_row = sound_row("RLS pending sound", "pending",
                                f"pending/{FIXED_PENDING}.mp3",
                                {"id": FIXED_PENDING})
        # Register the fixed ids with cleanup BEFORE inserting. If anything
        # between the insert and the append throws, cleanup never learns the row
        # exists — it survives the run and the next one dies on a duplicate key.
        # (Both rows use fixed UUIDs, so the ids are known in advance.)
        created_rows.extend([FIXED_APPROVED, FIXED_PENDING])
        st, body = svc.rest("POST", "sounds", approved_row, "select=id")
        if not hard("service key seeds approved row", st, body):
            return 1
        approved_id = body[0]["id"]
        st, body = svc.rest("POST", "sounds", pending_row, "select=id")
        if not hard("service key seeds pending row", st, body):
            return 1
        pending_id = body[0]["id"]

        st, body = anon.rest("GET", "sounds", query="select=id")
        anon_ids = {r["id"] for r in (body or [])} if isinstance(body, list) else set()
        check("anon reads approved rows", st == 200 and approved_id in anon_ids, f"status {st}")
        check("anon never reads pending rows", pending_id not in anon_ids)

        st, body = anon.rest("POST", "sounds",
                             sound_row("anon insert", "pending",
                                       f"pending/{OTHER_UUID}.mp3"))
        check("anon cannot insert rows", st >= 400, f"status {st}")

        # ------------------------------------------------------- member row rules --
        st, body = member.rest("POST", "sounds",
                               sound_row("self approve attempt", "approved",
                                         f"approved/{OTHER_UUID}.mp3"))
        check("member cannot insert approved rows (self-approval impossible)",
              st >= 400, f"status {st}")

        # Insert with someone ELSE's id as submitter.
        st, body = member.rest("POST", "sounds",
                               sound_row("forged submitter", "pending",
                                         f"pending/{OTHER_UUID}.mp3",
                                         {"submitted_by": admin_id}))
        check("member cannot insert with submitted_by = someone else", st >= 400,
              f"status {st}")

        own_id = str(uuid.uuid4())
        own_audio = f"pending/{own_id}.mp3"
        st, body = member.rest("POST", "sounds",
                               sound_row("member pending row", "pending", own_audio,
                                         {"id": own_id, "submitted_by": member_id}),
                               "select=id,status")
        check("member can insert pending rows", st == 201 and body and body[0]["status"] == "pending",
              f"status {st} {str(body)[:120]}")
        created_rows.append(own_id)

        st, body = member.rest("PATCH", "sounds", {"status": "approved"}, f"id=eq.{own_id}")
        check("member cannot self-approve", st >= 400, f"status {st}")
        st, body = member.rest("PATCH", "sounds",
                               {"status": "approved", "audio_path": f"approved/{own_id}.mp3"},
                               f"id=eq.{own_id}")
        check("member cannot self-approve with path swap", st >= 400, f"status {st}")

        # Editing/deleting rows RLS hides: PostgREST USING failures affect
        # ZERO rows and return 2xx — the row must remain untouched.
        st, body = member.rest("PATCH", "sounds", {"title_en": "hacked"}, f"id=eq.{approved_id}")
        check("member cannot edit others' rows", st < 300 and (body is None or body == []),
              f"status {st} {str(body)[:120]}")
        st, body = member.rest("GET", "sounds", query=f"id=eq.{approved_id}&select=title_en")
        check("others' rows are untouched after the attempt",
              st == 200 and body and body[0]["title_en"] == "RLS test sound")

        st, body = member.rest("DELETE", "sounds", query=f"id=eq.{approved_id}")
        check("member cannot delete others' rows", st < 300 and (body is None or body == []),
              f"status {st}")
        st, body = member.rest("GET", "sounds", query=f"id=eq.{approved_id}&select=id")
        check("others' rows still exist after the delete attempt",
              st == 200 and body and body[0]["id"] == approved_id)

        # Pointing the row at someone else's file is rejected by the DB trigger.
        st, body = member.rest("PATCH", "sounds",
                               {"status": "pending", "audio_path": f"pending/{OTHER_UUID}.mp3"},
                               f"id=eq.{own_id}")
        check("member cannot point audio_path at another row's file", st >= 400,
              f"status {st} {str(body)[:120]}")

        # Resubmit rule: a member edit of their own row must reset it to
        # pending — and the edit only lands when the client sends status='pending'.
        svc.rest("PATCH", "sounds", {"status": "rejected", "review_note": "test note 测试"},
                 f"id=eq.{own_id}")
        st, body = member.rest("PATCH", "sounds", {"title_en": "edited title"},
                               f"id=eq.{own_id}")
        check("editing a rejected row without resetting status is blocked", st >= 400,
              f"status {st}")
        st, body = member.rest("PATCH", "sounds",
                               {"title_en": "edited title", "status": "pending"},
                               f"id=eq.{own_id}")
        check("member can edit own rejected row (resubmit)", st < 300, f"status {st}")
        st, body = member.rest("GET", "sounds", query=f"id=eq.{own_id}&select=status")
        check("member edit resets the row to pending",
              st == 200 and body and body[0]["status"] == "pending", str(body)[:120])

        # Admin review rules. "Rejecting requires a note" is satisfied by whatever
        # note is ON the row, and this row still carries one from the rejection
        # above (the member's resubmit reset the status but not the note). Clear
        # it first, or the check passes on the stale note and verifies nothing.
        svc.rest("PATCH", "sounds", {"review_note": None}, f"id=eq.{own_id}")
        st, body = admin.rest("PATCH", "sounds", {"status": "rejected"}, f"id=eq.{own_id}")
        check("admin cannot reject without a review note", st >= 400, f"status {st}")
        st, body = admin.rest("PATCH", "sounds",
                              {"status": "rejected", "review_note": "Fix the transcript 请修改文字稿"},
                              f"id=eq.{own_id}")
        check("admin can reject with a note", st < 300, f"status {st}")

        # Profiles: no self-promotion.
        st, body = member.rest("PATCH", "profiles", {"role": "admin"}, f"id=eq.{member_id}")
        check("member cannot self-promote", st >= 400, f"status {st}")
        st, body = member.rest("PATCH", "profiles", {"display_name": "self"},
                               f"id=eq.{member_id}")
        check("member can edit own display name", st < 300, f"status {st}")

        # -------------------------------------------------------- storage ----
        anon_uploader = Client(url, anon_key)
        st, body = anon_uploader.upload(f"pending/{own_id}.mp3", b"RIFFfake")
        check("anon cannot upload audio", st >= 400, f"status {st}")

        st, body = member.upload(f"pending/{OTHER_UUID}.mp3", b"RIFFfake")
        check("member cannot upload audio without a matching own row", st >= 400,
              f"status {st}")

        st, body = member.upload(own_audio, b"RIFFfake-member")
        check("member can upload audio for their own pending row", st < 300,
              f"status {st} {str(body)[:120]}")
        created_objects.append(own_audio)

        st, body = anon.sign(own_audio)
        check("anon cannot sign (createSignedUrl) pending audio", st >= 400, f"status {st}")

        st, body = member.upload(f"approved/{own_id}.mp3", b"RIFFfake")
        check("member cannot upload directly into approved/", st >= 400, f"status {st}")

        st, body = member.upload("pending/other.mp3", b"RIFFfake")
        check("member cannot upload arbitrary filenames", st >= 400, f"status {st}")

        # The review-gate bypass: moving own pending audio into approved/.
        st, body = member.move(own_audio, f"approved/{own_id}.mp3")
        check("member cannot move own audio into approved/", st >= 400,
              f"status {st} {str(body)[:120]}")
        st, body = anon.sign(f"approved/{own_id}.mp3")
        check("no unapproved audio reachable in approved/ after the attempt",
              st >= 400, f"status {st}")

        st, body = anon.list_objects("pending")
        names = {o.get("name") for o in body} if isinstance(body, list) else set()
        leak = own_audio in names
        check("anon cannot list pending objects", not leak,
              f"status {st}, leaked={leak}")

        # Admin can upload anywhere (needed to repair/replace audio).
        scratch = "pending/admin-scratch.mp3"
        st, body = admin.upload(scratch, b"RIFFfake-admin")
        check("admin can upload audio anywhere", st < 300,
              f"status {st} {str(body)[:120]}")
        if st < 300:
            created_objects.append(scratch)

        # Signed URL for approved audio (the public playback path).
        svc_approved_obj = f"approved/{FIXED_APPROVED}.mp3"
        st, body = svc.upload(svc_approved_obj, b"RIFFfake")
        created_objects.append(svc_approved_obj)
        st, body = svc.sign(svc_approved_obj)
        check("signed URL can be created for approved audio",
              st == 200 and bool(body.get("signedURL")), f"status {st}")

        # ----------------------------------------------- approve flow ---------
        svc.rest("PATCH", "sounds", {"status": "pending"}, f"id=eq.{own_id}")
        st, body = svc.move(own_audio, f"approved/{own_id}.mp3")
        check("storage move pending -> approved works (service key)", st < 300,
              f"status {st} {str(body)[:120]}")
        if st < 300:
            created_objects.append(f"approved/{own_id}.mp3")
        st, body = admin.rest("PATCH", "sounds",
                              {"status": "approved", "audio_path": f"approved/{own_id}.mp3",
                               "approved_at": "2026-10-09T00:00:00Z", "approved_by": admin_id},
                              f"id=eq.{own_id}")
        check("admin approves after the move", st < 300, f"status {st} {str(body)[:120]}")
        st, body = anon.rest("GET", "sounds", query=f"id=eq.{own_id}&select=status")
        check("approved row is visible to anon",
              st == 200 and body and body[0]["status"] == "approved")

        # A published recording is a club asset: the original uploader cannot
        # delete it once it lives in approved/.
        st, body = member.remove(f"approved/{own_id}.mp3")
        check("member cannot delete their own approved/published audio", st >= 400,
              f"status {st}")

        # --------------------------------------------------- folder trigger --
        st, body = svc.rest("PATCH", "sounds",
                            {"status": "approved", "audio_path": "pending/nope.mp3"},
                            f"id=eq.{pending_id}")
        check("DB rejects approved status with a pending/ path", st >= 400, f"status {st}")
    except Exception as e:  # network/API failure is a FAIL, not a crash
        check("matrix completed without infrastructure errors", False, repr(e))
    finally:
        cleanup()

    print()
    passed = sum(results)
    print(f"{passed} passed, {len(results) - passed} failed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
