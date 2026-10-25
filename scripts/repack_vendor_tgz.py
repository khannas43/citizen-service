#!/usr/bin/env python3
"""Rewrite '@dg20/' to '@citizen/' inside vendored npm tarballs (compiled dist files still import the old scope)."""
import io, sys, tarfile
for path in sys.argv[1:]:
    out = io.BytesIO()
    with tarfile.open(path, "r:gz") as src, tarfile.open(fileobj=out, mode="w:gz") as dst:
        for m in src.getmembers():
            f = src.extractfile(m) if m.isfile() else None
            if f is None:
                dst.addfile(m); continue
            data = f.read()
            if b"@dg20/" in data:
                data = data.replace(b"@dg20/", b"@citizen/")
                m.size = len(data)
            dst.addfile(m, io.BytesIO(data))
    open(path, "wb").write(out.getvalue())
    print("repacked", path)
