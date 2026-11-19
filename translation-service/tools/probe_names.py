"""Try the model on person and place names (a few seconds, no download once the model is cached).

    cd translation-service && . .venv/bin/activate && HF_HUB_OFFLINE=1 python tools/probe_names.py
Copy the output back to the team; a Telugu reviewer should judge it.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["MT_ENGINE"] = "indictrans2"
from app import main as svc                                           # noqa: E402

names = ["A. Ankam", "Ankam Lakshmi", "Ravi Kumar Reddy", "Venkata Ramana", "Sai Teja Goud", "Sunitha Rani",
         "Kamareddy", "Nizamabad", "Sangareddy", "Jagtial", "Mancherial", "Bhadrachalam", "Male", "Female"]
out, _ = svc.translate_protected(names, "te")
for a, b in zip(names, out):
    print(f"{a:22} -> {b}")
