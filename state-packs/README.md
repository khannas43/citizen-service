# State packs

One folder per state (`GJ`, `TG`, `TN` ...). A pack holds the facts that differ by state:
geography (State > District > Sub-district > Village), scheme catalogue, languages and labels.
See the header of `scripts/load_state_pack.py` for the file layout.

    python3 scripts/load_state_pack.py state-packs/GJ > /tmp/gj.sql
    psql -d citizen_db -v ON_ERROR_STOP=1 -f /tmp/gj.sql        # as the Postgres superuser; safe to repeat

| Pack | Status |
| --- | --- |
| `GJ` | Districts (32) and talukas (216) from the DG2.0 demo seed. Not LGD-verified, no LGD codes. |
| `TG` | State facts only. Add LGD exports to `TG/lgd/` (see its README); schemes still to be chosen. |
| `_fixtures/tg-sample` | Invented names in LGD export format, used to test the loader. Never load it into a real database. |

Loader checks done on a scratch Postgres 16: both packs load and reload without duplicates; rows of other states in a
multi-state LGD file are skipped; the same village name in two mandals is kept as two units; apostrophes and Telugu
text are stored correctly; the same taluka name in two districts (e.g. Mahuva) stays separate.
