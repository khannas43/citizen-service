# Telangana geography: how to load

The authoritative source is the Local Government Directory (https://lgdirectory.gov.in, "Download Directory").
Download these for Telangana and save them here, as CSV, with these names:

| File | LGD report |
| --- | --- |
| `districts.csv` | Districts of the state |
| `subdistricts.csv` | Sub-districts (Telangana calls them Mandals) |
| `villages.csv` | Villages (optional, about ten thousand rows) |

Header names are matched loosely (e.g. "District Code", "Sub-District Name (In English)", "Village Code"), so the
LGD column names can be used as they are. If a file covers several states, `lgd_state_code` in `../pack.json`
filters it to Telangana. Add a local-language name column (a header containing "Name" and "Local") to fill Telugu names.

Then:

    python3 scripts/load_state_pack.py state-packs/TG > /tmp/tg.sql
    psql -d citizen_db -v ON_ERROR_STOP=1 -f /tmp/tg.sql

The India Data portal copy of LGD (https://ckandev.indiadataportal.com/dataset/lgd-codes) is dated 2023, so prefer a fresh
LGD download: Telangana's districts and mandals have changed since.

## What is in this folder now
The LGD "all India" spreadsheets (`*.xlsx`, not committed) were cut down to Telangana (LGD state code 36) with
`scripts/lgd_to_csv.py`: 33 districts, 621 sub-districts (mandals), 11,450 villages. The loader reads the CSVs first and also
accepts the `.xlsx` files directly (slow for the 500 MB village sheet). To refresh, download again from LGD and run, for each file:

    python3 scripts/lgd_to_csv.py state-packs/TG/lgd/villages.xlsx state-packs/TG/lgd/villages.csv --state 36
