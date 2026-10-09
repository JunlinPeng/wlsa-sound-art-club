#!/usr/bin/env python3
"""Smoke test for the DEPLOYED Shanghai Sound Map — run from the school network.

This is the mainland-China reachability check for github.io + supabase.co.
Stdlib-only network checks; the map-renders/pin-count check uses a real
browser when Selenium is installed, otherwise it SKIPs (the playbook's
manual phone walk covers it then).

Usage:
    python scripts/smoke_test.py --url https://USER.github.io/wlsa-soundmap/
    SITE_URL=https://USER.github.io/wlsa-soundmap/ python scripts/smoke_test.py
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _supa import load_env  # noqa: E402

ENV_PATH = Path(__file__).resolve().parent / ".env"


def fetch(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"User-Agent": "wlsa-smoke-test/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode("utf-8", "replace")


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test the deployed sound map.")
    parser.add_argument("--url", default=os.environ.get("SITE_URL", ""),
                        help="deployed site URL, e.g. https://USER.github.io/wlsa-soundmap/")
    args = parser.parse_args()

    env = load_env(ENV_PATH)
    site = args.url.rstrip("/")
    supabase_url = env.get("SUPABASE_URL", "")
    anon_key = env.get("SUPABASE_ANON_KEY", "")

    results = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'}: {label}" + (f" — {detail}" if detail else ""))

    def skip(label: str, detail: str = "") -> None:
        print(f"SKIP: {label}" + (f" — {detail}" if detail else ""))

    if not site:
        print("FAIL: no site URL — pass --url or set SITE_URL (see playbooks/launch-soundmap.md)")
        return 1

    # ------------------------------------------------------------- site ------
    st, body = fetch(site + "/")
    html = body.decode("utf-8", "replace") if isinstance(body, bytes) else ""
    check("site loads over HTTPS", st == 200 and "Shanghai Sound Map" in html,
          f"status {st}")
    check("shell markers present (player bar + router boot)",
          'id="player-bar"' in html and "js/app.js" in html)

    st, body = fetch(site + "/config.js")
    cfg = body.decode("utf-8", "replace") if isinstance(body, bytes) else ""
    keys = re.findall(r"(AMAP_KEY|AMAP_SECURITY_CODE|SUPABASE_URL|SUPABASE_ANON_KEY)\s*:\s*['\"]([^'\"]*)", cfg)
    cfg_map = {k: v for k, v in keys}
    check("config.js served with real keys",
          st == 200 and cfg_map.get("AMAP_KEY") and "YOUR-" not in cfg,
          f"status {st}")
    check("config.js has no placeholders", "YOUR-" not in cfg)

    st, body = fetch(site + "/vendor/supabase.min.js")
    check("vendored supabase-js served (no CDN dependency)", st == 200,
          f"status {st}")

    st, body = fetch(site + "/css/soundmap.css")
    check("stylesheet served", st == 200, f"status {st}")

    # --------------------------------------------------------- backend ------
    backend_ok = False
    if not (supabase_url and anon_key):
        skip("Supabase checks — scripts/.env has no credentials")
    else:
        hdr = {"apikey": anon_key}
        req = urllib.request.Request(
            f"{supabase_url.rstrip('/')}/rest/v1/sounds?select=id&status=eq.approved",
            headers=hdr)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                approved = json.loads(resp.read())
                check("Supabase REST reachable as anon", True)
                check("anon sees approved rows only (response is a list)",
                      isinstance(approved, list))
                approved_ids = {r["id"] for r in approved}
                backend_ok = True
        except urllib.error.HTTPError as e:
            check("Supabase REST reachable as anon", False, f"HTTP {e.code}")
        except Exception as e:
            check("Supabase REST reachable as anon", False, repr(e))

        # Anon must never see pending object names. A healthy RLS-filtered
        # backend returns 200 + []; an error is fine too. Only a leak (names
        # in the listing) fails this check.
        req = urllib.request.Request(
            f"{supabase_url.rstrip('/')}/storage/v1/object/list/audio?prefix=pending",
            headers=hdr)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                listed = json.loads(resp.read())
                if isinstance(listed, list) and len(listed) == 0:
                    check("anon cannot list pending storage objects", True)
                elif isinstance(listed, dict) and listed.get("error"):
                    check("anon cannot list pending storage objects", True)
                else:
                    check("anon cannot list pending storage objects", False,
                          f"{len(listed)} object names leaked: {str(listed)[:120]}")
        except urllib.error.HTTPError:
            check("anon cannot list pending storage objects", True)
        except Exception as e:
            check("anon cannot list pending storage objects", False, repr(e))

    # ----------------------------------------------------- browser check -----
    try:
        from selenium import webdriver  # noqa: F401
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
    except ImportError:
        skip("map-renders + pin-count check — Selenium not installed")
        print(f"{sum(results)} passed, {len(results) - sum(results)} failed")
        return 0 if all(results) else 1

    if not backend_ok:
        skip("map-renders + pin-count check — Supabase backend unreachable")
        print(f"{sum(results)} passed, {len(results) - sum(results)} failed")
        return 0 if all(results) else 1

    try:
        import time
        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1280,900")
        driver = webdriver.Chrome(options=opts)
        try:
            driver.get(site + "/#/")
            deadline = time.time() + 25
            pins, empty_visible = [], False
            while time.time() < deadline:
                pins = driver.find_elements(By.CSS_SELECTOR, ".pin")
                empty_visible = bool(driver.execute_script(
                    "var e = document.querySelector('#map-empty');"
                    "return !!(e && !e.hidden);"))
                if pins or empty_visible:
                    break
                time.sleep(0.5)
            pin_count = len(pins)
            check(f"pin count matches approved rows ({pin_count} pins, {len(approved_ids)} rows)",
                  pin_count == len(approved_ids))
            if pin_count == 0:
                check("empty-state card shows when there are no pins", empty_visible)
            else:
                check("map rendered pins", True)
        finally:
            driver.quit()
    except Exception as e:
        check("browser map check", False, repr(e)[:200])

    print()
    passed = sum(results)
    print(f"{passed} passed, {len(results) - passed} failed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
