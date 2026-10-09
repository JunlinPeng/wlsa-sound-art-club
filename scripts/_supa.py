"""Shared helpers for the sound-map ops scripts (stdlib only).

Loads credentials from scripts/.env and talks to Supabase REST / storage /
auth directly — no SDK, no third-party packages. Import as a module:

    from _supa import load_env, Client, service_client, require_env

Never import this from inside tests/ — tests/check_rls.py keeps its own copy
so the test stays self-contained.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / "scripts" / ".env"
BUCKET = "audio"


def load_env(path: Path = ENV_PATH) -> dict:
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


def require_env() -> dict:
    env = load_env()
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY") if not env.get(k)]
    if missing:
        sys.stderr.write(
            "ERROR: scripts/.env is missing " + ", ".join(missing)
            + " — copy scripts/.env.example and fill it in.\n")
        sys.exit(2)
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
            with urllib.request.urlopen(req, timeout=60) as resp:
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
        path = f"/rest/v1/{table}"
        if query:
            path += "?" + query
        return self.request(method, path, body=body)

    # Storage -------------------------------------------------------------------
    def upload(self, path: str, data: bytes, content_type: str = "audio/mpeg"):
        return self.request("PUT", f"/storage/v1/object/{BUCKET}/{path}", raw=data,
                            headers={"Content-Type": content_type})

    def download(self, path: str):
        """GET an object and return its RAW bytes — the storage API returns
        binary for object downloads, so this never goes through json.loads."""
        req = urllib.request.Request(self.url + f"/storage/v1/object/{BUCKET}/{path}",
                                     method="GET", headers=self.headers())
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                return resp.status, data if data else b""
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def remove(self, path: str):
        return self.request("DELETE", f"/storage/v1/object/{BUCKET}/{path}")

    def list_objects(self, prefix: str = ""):
        q = urllib.parse.quote(prefix, safe="")
        return self.request("GET", f"/storage/v1/object/list/{BUCKET}?prefix={q}")

    def move(self, source: str, destination: str):
        return self.request("POST", "/storage/v1/object/move",
                            body={"bucketId": BUCKET, "sourceKey": source,
                                  "destinationKey": destination})


def service_client() -> Client:
    env = require_env()
    return Client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
