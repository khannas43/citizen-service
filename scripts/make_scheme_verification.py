#!/usr/bin/env python3
"""Build state-packs/TG/schemes_verification.csv from schemes.csv (adds review columns)."""
import csv, sys
src, out = sys.argv[1], sys.argv[2]
BRS = ("RYTHU-BANDHU","MCH-KIT","KCR","2BHK","AROGYA-LAKSHMI","AASARA","DALIT-BANDHU","OWN-YOUR-AUTO","DRIVER-EMPOWERMENT","KALYANA-LAKSHMI","SHAADI-MUBARAK","RYTHU-BIMA","GRUHA-LAKSHMI","SHEEP-AND-GOAT","VIVEKANANDA","ECONOMIC-REHAB")
CON = ("INDIRAMMA","MAHALAKSHMI","GRUHA-JYOTHI","RYTHU-BHAROSA","YUVA","PRAJA-PALANA","REVANTH","PONGULETI","CHEYUTHA")
rows = list(csv.DictReader(open(src, encoding="utf-8")))
cols = ["code","name_en","category","hint_era","hint_reason","official_department","official_source_url","status_to_set","benefit_summary","eligibility_summary","apply_mode","last_checked_by","last_checked_date","verified_to_set","notes","aggregator_url"]
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, cols); w.writeheader()
    for r in rows:
        c = r["code"]
        if any(k in c for k in BRS): era, why = "likely BRS-era (pre-Dec 2023)", "Name may be renamed, merged or discontinued; confirm still in force"
        elif any(k in c for k in CON): era, why = "likely 2023+ government", "Confirm current guideline/G.O. and amounts"
        else: era, why = "unknown", "Confirm owner department and that it is active"
        w.writerow({"code":c,"name_en":r["name_en"],"category":r["category"],"hint_era":era,"hint_reason":why,
                    "status_to_set":"","verified_to_set":"","aggregator_url":r["source_url"]})
print(len(rows),"rows ->",out)
