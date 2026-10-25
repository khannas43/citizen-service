#!/usr/bin/env python3
"""Cut one state out of an all-India LGD .xlsx export and save it as a small CSV (same headers, one header row).

    python3 scripts/lgd_to_csv.py state-packs/TG/lgd/villages.xlsx state-packs/TG/lgd/villages.csv --state 36

The CSVs are what gets committed; the big all-India .xlsx files are not (see .gitignore).
"""
import csv, itertools, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_state_pack import read_table, code_text, pick, norm

def main():
    a = sys.argv[1:]
    if len(a) != 4 or a[2] != "--state":
        sys.exit(__doc__)
    src, dst, state = a[0], a[1], a[3]
    it = read_table(src)
    first = next(it)
    H = list(first.keys())
    c_state = pick(H, ["state", "code"], ["census"])
    if not c_state:
        sys.exit("no 'State Code' column in " + src)
    keep = [h for h in H if not norm(h).startswith("sno") and h]
    n = 0
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(keep)
        for r in itertools.chain([first], it):
            if code_text(r.get(c_state)) == state:
                w.writerow([code_text(r[h]) if "code" in norm(h) or "version" in norm(h) else r[h] for h in keep])
                n += 1
    print(f"{dst}: {n} rows for state {state}")

main()
