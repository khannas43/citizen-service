"""Download the model, translate the test sentences, and report speed, memory and whether protected terms survive.

    python tools/evaluate.py                         # the 200M model
    python tools/evaluate.py --model ai4bharat/indictrans2-en-indic-1B
Writes review_<model>.csv: give it to the Telugu reviewer; they fill the last two columns. Needs HF_TOKEN once access is granted.
"""
from __future__ import annotations
import argparse, csv, os, statistics, sys, time, resource

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="ai4bharat/indictrans2-en-indic-dist-200M")
    ap.add_argument("--set", default=os.path.join(os.path.dirname(__file__), "testset_en.txt"))
    ap.add_argument("--batch", type=int, default=8)
    a = ap.parse_args()
    os.environ["MT_ENGINE"] = "indictrans2"
    os.environ["MT_MODEL"] = a.model
    from app import main as svc                                   # noqa: E402  (reads MT_MODEL at import)
    texts = [l.strip() for l in open(a.set, encoding="utf-8") if l.strip()]
    print(f"model {a.model}: {len(texts)} sentences, batch {a.batch}")
    t0 = time.time()
    svc.engine.translate(["Warm up."], "te")                       # loads the model
    print(f"model loaded in {time.time() - t0:.1f}s")
    out, per, fell = [], [], 0
    for i in range(0, len(texts), a.batch):
        chunk = texts[i:i + a.batch]
        t = time.time()
        res, fb = svc.translate_protected(chunk, "te")
        dt = (time.time() - t) * 1000
        per += [dt / len(chunk)] * len(chunk)
        out += res
        fell += fb
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024)
    name = a.model.split("/")[-1]
    path = f"review_{name}.csv"
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["english", "machine_telugu", "reviewer_telugu", "verdict (ok / fix / wrong)"])
        for e, t in zip(texts, out):
            w.writerow([e, t, "", ""])
    for e, t in list(zip(texts, out))[:8]:
        print(f"\n  {e}\n  {t}")
    print(f"\nspeed: median {statistics.median(per):.0f} ms per sentence, 95th percentile {sorted(per)[int(len(per) * .95) - 1]:.0f} ms")
    print(f"peak memory about {rss:.0f} MB; texts re-translated because a protected term was lost: {fell}")
    print(f"wrote {path} for the reviewer")


if __name__ == "__main__":
    main()
