#!/usr/bin/env python3
"""A stand-in for a department's own system, using the real partner feed. Standard library only; run it on the laptop.

  python3 mdm-service/tools/dept_feed_demo.py --key "<key shown once on the Access / keys screen>"            # pull and list
  python3 mdm-service/tools/dept_feed_demo.py --key "$KEY" --answer ACCEPTED --notice 12                      # answer one notice
  python3 mdm-service/tools/dept_feed_demo.py --key "$KEY" --answer APPLIED --ref HLT-0042 --notice 12
  python3 mdm-service/tools/dept_feed_demo.py --key "$KEY" --answer REJECTED --reason "Already on our register" --notice 12
  python3 mdm-service/tools/dept_feed_demo.py --key "$KEY" --answer ACCEPTED --all                            # answer everything open

Use a key for one department on the keys screen (the secret is shown once). The feed shows only that department's notices.
A statutory notice (a pension stop, a withdrawn consent) is answered with ACKNOWLEDGED or APPLIED; a rejection is refused.
Unanswered notices stay in the feed until answered, so every run starts from cursor 0 unless --from says otherwise.
"""
import argparse, json, sys, urllib.request, urllib.error


def call(base, key, path, body=None):
    req = urllib.request.Request(f"{base}/api/partner{path}", data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET", headers={"X-Api-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:                                   # noqa: BLE001
            return e.code, {"detail": e.reason}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:31173/mdm-service", help="portal address plus /mdm-service")
    ap.add_argument("--key", required=True)
    ap.add_argument("--from", dest="start", type=int, default=None, help="cursor to start from (default 0)")
    ap.add_argument("--answered", action="store_true", help="include notices already answered")
    ap.add_argument("--answer", choices=["ACCEPTED", "APPLIED", "REJECTED", "ACKNOWLEDGED"])
    ap.add_argument("--notice", type=int)
    ap.add_argument("--all", action="store_true", help="answer every open notice that allows this outcome")
    ap.add_argument("--reason")
    ap.add_argument("--ref", help="the department's own reference (needed for APPLIED)")
    a = ap.parse_args()
    cursor = a.start or 0
    code, d = call(a.base, a.key, f"/feed?after={cursor}&limit=200{'&answered=true' if a.answered else ''}")
    if code != 200:
        sys.exit(f"Feed refused ({code}): {d.get('detail')}")
    print(f"{d['department']}: {d['count']} notice(s) from cursor {cursor}")
    for n in d["items"]:
        print(f"  #{n['notice_id']:<5} {n['state']:<8} {n['kind']:<10} {n['use_name'][:48]:<48} due {n['respond_by'][:16]}  can answer: {', '.join(n['allowed_outcomes'])}")
    if a.answer:
        todo = [n for n in d["items"] if (a.notice and n["notice_id"] == a.notice) or (a.all and a.answer in n["allowed_outcomes"] and not n["answered"])]
        if not todo:
            sys.exit("Nothing to answer: give --notice <id> or --all")
        for n in todo:
            code, r = call(a.base, a.key, f"/feed/{n['notice_id']}/response", {"outcome": a.answer, "reason": a.reason, "department_ref": a.ref})
            print(f"  -> #{n['notice_id']} {a.answer}: {'ok' if code == 200 else 'refused (%s): %s' % (code, r.get('detail'))}"
                  + (f" (sent back for review as proposal {r['reopened_proposal']})" if code == 200 and r.get("reopened_proposal") else ""))


if __name__ == "__main__":
    main()
