#!/usr/bin/env python3
"""Load test for the exchange (CC9). Standard library only; run it on the laptop.

  python3 mdm-service/tools/loadtest.py --token "$(pbpaste)" --requests 300 --workers 10

Get the token from the officer portal: browser console -> localStorage.getItem('officer_token'), then copy it.
Each request is a verification-only question about a random person for a statutory use (no consent needed).
The summary is printed and also posted to the control tower, where it shows under "Load test evidence".
Note: asking about the same person more than the policy limit in an hour is flagged as possible misuse. That is
the limiter working, so those answers are counted as correct responses and reported in the note.
"""
import argparse, json, random, statistics, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor


def call(base, token, path, body=None):
    req = urllib.request.Request(f"{base}/api{path}", data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:31173/mdm-service", help="portal address plus /mdm-service")
    ap.add_argument("--token", required=True)
    ap.add_argument("--requests", type=int, default=300)
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--no-post", action="store_true", help="do not post the result to the control tower")
    a = ap.parse_args()
    ids = []
    for off in range(0, 600, 200):
        ids += [p["id"] for p in call(a.base, a.token, f"/persons?limit=200&offset={off}")["items"]]
    if not ids:
        sys.exit("No people found. Load the data first.")
    plan = [random.choice(ids) for _ in range(a.requests)]
    lat, errors, flagged = [], 0, 0

    def one(pid):
        t = time.perf_counter()
        try:
            r = call(a.base, a.token, "/x/verify", {"requester": "pension", "purpose": "PENSION_ELIGIBILITY", "question": "AGE_AT_LEAST", "params": {"years": 60}, "person_id": pid})
            return (time.perf_counter() - t) * 1000, True, r.get("alert") == "REPEATED_LOOKUP"
        except (urllib.error.URLError, OSError, ValueError):
            return (time.perf_counter() - t) * 1000, False, False

    t0 = time.perf_counter()
    with ThreadPoolExecutor(a.workers) as ex:
        for ms, ok, fl in ex.map(one, plan):
            lat.append(ms)
            errors += 0 if ok else 1
            flagged += 1 if fl else 0
    secs = time.perf_counter() - t0
    lat.sort()
    out = {"requests": a.requests, "seconds": round(secs, 2), "ok": a.requests - errors, "errors": errors,
           "p50_ms": int(statistics.median(lat)), "p95_ms": int(lat[int(0.95 * (len(lat) - 1))]), "rps": round(a.requests / secs, 1),
           "note": f"{a.workers} workers; {flagged} answers refused by the repeat-lookup limiter" if flagged else f"{a.workers} workers"}
    print(json.dumps(out, indent=2))
    if not a.no_post:
        call(a.base, a.token, "/x/loadtests", out)
        print("Posted to the control tower.")


if __name__ == "__main__":
    main()
