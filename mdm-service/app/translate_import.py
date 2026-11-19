"""Load the Telugu reviewer's CSV into the reviewed-translation store.

    kubectl -n citizen exec -i deploy/mdm-service -- python -m app.translate_import --reviewer "Reviewer name" - < review_indictrans2-en-indic-dist-200M.csv
    python -m app.translate_import --reviewer "Reviewer name" review.csv --dry-run

Rows: verdict ok keeps the machine text as approved; a filled reviewer_telugu column is stored as corrected. Anything else is skipped and listed.
"""
from __future__ import annotations
import argparse, csv, io, sys

from .db import connect
from . import translate


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="CSV path, or - for standard input")
    ap.add_argument("--reviewer", required=True)
    ap.add_argument("--target", default="te")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    raw = sys.stdin.buffer.read() if a.file == "-" else open(a.file, "rb").read()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    with connect() as conn:
        cur = conn.cursor()
        out = translate.import_rows(cur, rows, a.reviewer, a.target)
        if a.dry_run:
            conn.rollback()
        else:
            conn.commit()
    print(f"{'Would store' if a.dry_run else 'Stored'}: {out['approved']} approved, {out['corrected']} corrected; skipped {len(out['skipped'])}; rejected {len(out['rejected'])}")
    for e in out["skipped"]:
        print("  skipped (no verdict or no replacement):", e)
    for r in out["rejected"]:
        print("  rejected:", r["english"], "-", r["why"])
    return out


if __name__ == "__main__":
    main()
