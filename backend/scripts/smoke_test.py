"""
Smoke test script for Projects 1, 2, and 3.
Runs against a live backend server at http://localhost:8000.
"""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
COOKIE_JAR: dict[str, str] = {}


def _headers(json_body: bool = True) -> dict:
    h: dict = {}
    if json_body:
        h["Content-Type"] = "application/json"
    if COOKIE_JAR:
        h["Cookie"] = "; ".join(f"{k}={v}" for k, v in COOKIE_JAR.items())
    return h


def _capture_cookies(resp_headers) -> None:
    for header, value in resp_headers.items():
        if header.lower() == "set-cookie":
            name, rest = value.split("=", 1)
            cookie_val = rest.split(";")[0]
            if cookie_val.strip() == "" or "deleted" in rest.lower():
                COOKIE_JAR.pop(name.strip(), None)
            else:
                COOKIE_JAR[name.strip()] = cookie_val.strip()


def request(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers=_headers(bool(data)),
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            _capture_cookies(resp.headers)
            content_type = resp.headers.get("content-type", "")
            raw = resp.read()
            if "text/event-stream" in content_type:
                # Parse SSE: collect data lines, return as {"chunks": [...]}
                chunks = []
                for line in raw.decode().splitlines():
                    if line.startswith("data: "):
                        payload = line[6:]
                        if payload not in ("[DONE]",):
                            chunks.append(payload)
                return resp.status, {"chunks": chunks, "full": "".join(chunks)}
            if not raw:
                return resp.status, {}
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, json.loads(raw) if raw else {}


PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
results: list[tuple[str, bool, str]] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    results.append((label, condition, detail))
    icon = PASS if condition else FAIL
    print(f"  {icon}  {label}" + (f"  [{detail}]" if detail else ""))


def section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


# ── Project 1 ─────────────────────────────────────────────────
section("Project 1 · Health + LangChain backend reachable")
status, body = request("GET", "/health")
check("GET /health returns 200", status == 200)
check("Health body has status ok", body.get("status") == "ok", str(body))


# ── Project 2 · Employee auth, DB persistence ──────────────────
section("Project 2 · Employee domain auth")

# Non-employee domain should fail (we can only check that the endpoint is wired;
# the reject happens inside Google token validation so we just ensure the endpoint exists)
status, body = request("POST", "/api/auth/google/login", {"credential": "invalid"})
check("POST /api/auth/google/login rejects bad token with 401", status == 401)
check("Error key is invalid_google_token", body.get("detail", {}).get("error") == "invalid_google_token", str(body))

COOKIE_JAR.clear()

# Manual signup with non-employee domain
status, body = request("POST", "/api/auth/signup", {
    "email": "smoke@gmail.com",
    "name": "Smoke External",
    "password": "Password123",
})
check("Signup with non-employee email rejected with 403", status == 403)
check("Error key is domain_not_allowed", body.get("detail", {}).get("error") == "domain_not_allowed", str(body))


section("Project 2 · Manual signup + login + session")

EMAIL = "smoketest@amzur.com"
PASSWORD = "Password123!"

COOKIE_JAR.clear()
status, body = request("POST", "/api/auth/signup", {
    "email": EMAIL,
    "name": "Smoke User",
    "password": PASSWORD,
})
check("Employee signup returns 200 (or 409 if already exists)", status in (200, 409))

# Logout to reset session
COOKIE_JAR.clear()
status, body = request("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
check("Employee login returns 200", status == 200)
check("Session cookie set after login", "access_token" in COOKIE_JAR)

status, body = request("GET", "/api/auth/me")
check("GET /api/auth/me returns authenticated user", status == 200)
check("Authenticated user email matches", body.get("email") == EMAIL, str(body))
check("Authenticated user has name", bool(body.get("name")))

status, body = request("POST", "/api/auth/login", {"email": EMAIL, "password": "WrongPass999"})
check("Login with wrong password returns 401", status == 401)
check("Error key is invalid_credentials", body.get("detail", {}).get("error") == "invalid_credentials")

# Re-login correctly
COOKIE_JAR.clear()
status, _ = request("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
assert status == 200, "Could not log in for chat smoke tests"


section("Project 2 · Chat persistence and thread creation")

status, body = request("POST", "/api/chat/send", {"message": "Hello, who are you?"})
check("POST /api/chat/send returns 200 (streaming response starts)", status == 200)
check("Streamed response has at least one chunk", len(body.get("chunks", [])) >= 1,
      f"{len(body.get('chunks', []))} chunks")
check("LLM returned non-empty reply", bool(body.get("full", "").strip()),
      repr(body.get("full", "")[:80]))

status, body = request("GET", "/api/chat/threads")
check("GET /api/chat/threads returns 200", status == 200)
threads = body.get("threads", [])
check("At least one thread exists after sending", len(threads) >= 1, f"{len(threads)} threads")
thread_id = threads[0]["id"]
check("Thread has a non-empty title", bool(threads[0].get("title")))

status, body = request("GET", f"/api/chat/history?thread_id={thread_id}")
check("GET /api/chat/history with thread_id returns 200", status == 200)
messages = body.get("messages", [])
check("Thread has at least 2 messages (user + assistant)", len(messages) >= 2,
      f"{len(messages)} messages")
roles = [m["role"] for m in messages]
check("First message is user role", roles[0] == "user")
check("Second message is assistant role", roles[1] == "assistant")
check("Assistant replied with non-empty content", bool(messages[1].get("content")))

# All-history endpoint (no thread_id)
status, body = request("GET", "/api/chat/history")
check("GET /api/chat/history without thread_id returns 200", status == 200)


# ── Project 3 · Google OAuth endpoint exists, thread CRUD ───────
section("Project 3 · Google OAuth endpoint wired")

status, body = request("POST", "/api/auth/google/login", {"credential": "bad_but_routed"})
check("POST /api/auth/google/login endpoint exists and validates (401 not 404/422)", status == 401)


section("Project 3 · Thread rename")

status, body = request("PATCH", f"/api/chat/threads/{thread_id}", {"title": "Smoke Renamed"})
check("PATCH /api/chat/threads/:id returns 200", status == 200)
check("Renamed thread title reflects change", body.get("title") == "Smoke Renamed", str(body))

status, body = request("GET", "/api/chat/threads")
titles = [t["title"] for t in body.get("threads", [])]
check("Renamed title appears in thread list", "Smoke Renamed" in titles, str(titles))

status, _ = request("PATCH", f"/api/chat/threads/{thread_id}", {"title": "  "})
check("Rename with blank title returns 400", status == 400)


section("Project 3 · Thread delete")

# Create a second thread to delete so we preserve the first for history checks
status, _ = request("POST", "/api/chat/send", {"message": "This thread will be deleted"})
status, body = request("GET", "/api/chat/threads")
threads_now = body.get("threads", [])
delete_id = next((t["id"] for t in threads_now if t["id"] != thread_id), thread_id)

status, body = request("DELETE", f"/api/chat/threads/{delete_id}")
check("DELETE /api/chat/threads/:id returns 200", status == 200)
check("Delete response status is ok", body.get("status") == "ok", str(body))

status, body = request("GET", "/api/chat/threads")
remaining_ids = [t["id"] for t in body.get("threads", [])]
check("Deleted thread no longer in thread list", delete_id not in remaining_ids)

status, _ = request("DELETE", f"/api/chat/threads/{delete_id}")
check("Deleting non-existent thread returns 404", status == 404)


section("Project 3 · Logout")

status, body = request("POST", "/api/auth/logout")
check("POST /api/auth/logout returns 200", status == 200)

status, body = request("GET", "/api/auth/me")
check("GET /api/auth/me after logout returns 401", status == 401)


# ── Summary ────────────────────────────────────────────────────
section("Smoke Test Summary")
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
total = len(results)
print(f"\n  Passed: {passed}/{total}")
if failed:
    print(f"\n  FAILURES:")
    for label, ok, detail in results:
        if not ok:
            print(f"    {FAIL}  {label}" + (f"  [{detail}]" if detail else ""))
    sys.exit(1)
else:
    print(f"\n  All smoke checks passed.")
