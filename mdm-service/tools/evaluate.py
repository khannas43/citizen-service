"""Run matching on the extracts and score it against the answer key (truth_links.csv)."""
import csv, sys, time, collections
from itertools import combinations
from app.sources import load_dir
from app.matching import MatchConfig, cluster_records

folder = sys.argv[1] if len(sys.argv) > 1 else "/tmp/t/out"
cfg = MatchConfig()
t0 = time.time()
recs = load_dir(folder)
truth = {}
for r in csv.DictReader(open(f"{folder}/truth_links.csv")):
    truth[(r["source"], r["source_record_id"])] = r["person_id"]
for r in recs:
    r.truth = truth.get((r.source, r.rid))
dec, members = cluster_records(recs, cfg)
print(f"{len(recs)} records -> {len(members)} clusters in {time.time()-t0:.1f}s")
by = {r.pk: r for r in recs}
st = collections.Counter(d.status for d in dec.values())
print("decisions:", dict(st))
# pairwise precision / recall over auto-linked clusters (review items stay separate)
tp = fp = 0
for cl, ms in members.items():
    for a, b in combinations(ms, 2):
        ta, tb = by[a].truth, by[b].truth
        if ta and tb:
            if ta == tb: tp += 1
            else: fp += 1
total_true = 0
byperson = collections.defaultdict(list)
for r in recs:
    if r.truth: byperson[r.truth].append(r.pk)
for p, ms in byperson.items():
    n = len(ms); total_true += n * (n - 1) // 2
print(f"pairwise precision {tp/max(1,tp+fp):.4f}  recall {tp/max(1,total_true):.4f}  (tp={tp} fp={fp} true-pairs={total_true})")
# review items: would the best candidate have been right?
ok = bad = nocand = 0
for pk, d in dec.items():
    if d.status == "IN_REVIEW":
        if d.candidates:
            cl = d.candidates[0][0]
            truths = {by[m].truth for m in members[cl] if m != pk}
            if by[pk].truth in truths: ok += 1
            else: bad += 1
        else: nocand += 1
print(f"review band: best candidate correct {ok}, wrong {bad}, no cand {nocand}")
# NEW records that should have matched
missed = 0
for pk, d in dec.items():
    if d.status == "NEW" and by[pk].truth and len(byperson[by[pk].truth]) > 1:
        missed += 1
print("records left unlinked although the person has other records:", missed)
persons = {r.truth for r in recs if r.truth}
print("true persons:", len(persons), "clusters:", len(members), " singletons:", sum(1 for m in members.values() if len(m)==1))
# per source link rate
rows = collections.defaultdict(collections.Counter)
for pk, d in dec.items(): rows[by[pk].source][d.status] += 1
for s, c in sorted(rows.items()): print(f"  {s:22s}", dict(c))
