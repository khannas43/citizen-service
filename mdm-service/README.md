# MDM service (Master Data Management)

Links the records that departments hold about the same person, builds a golden record with visible rules, flags data-quality problems and
derives relationships. **Departments stay authoritative: nothing is written back to them.** All tables carry `state_code` and row-level
security, like the other services; the service connects as `citizenuser`.

## Run
    scripts/mdm_setup.sh          # schema + image + deployment (namespace citizen)
    scripts/mdm_load.sh           # generate TG extracts, copy to the pod, match, build golden records
Add `--force` to `mdm_load.sh` to reload after stewards have made decisions (a reload discards them).

## Pieces
- `app/matching.py`   explainable record linkage: name (Telugu to Latin), birth date/year/age, gender, place, address, parents; blocking; auto / review / new.
- `app/survivorship.py` which source wins per attribute (rules are text on screen), data-quality checks.
- `app/loader.py`     `python -m app.loader --dir <extracts>`; reports precision/recall when `truth_links.csv` is present (synthetic data only).
- `app/stewardship.py` link / keep-separate / unlink / correction request; every action is audited (hash chain, `GET /audit/verify`).
- `app/api.py`        JSON API under `/mdm-service/api/...` (nginx location in the officer portal).
- `tools/evaluate.py` offline tuning against the answer key.

## Access
Bearer token from Keycloak realm `citizen`. Reading: `MDM_READ_ROLES` (default any signed-in user). Link decisions: `MDM_WRITE_ROLES`
(default MDM_STEWARD, MDM_ADMIN, ADMIN). Saving rules: `MDM_ADMIN_ROLES`. `MDM_AUTH_DISABLED=true` is for tests only.

## Test
    MDM_AUTH_DISABLED=true MDM_DB_DSN="host=... dbname=citizen_db user=citizenuser password=..." python -m pytest tests -q

## Endpoints (all GET unless noted)
dashboard · persons?q= · persons/{id} · persons/{id}/graph · households/{ration_card} · review · review/{id} · POST review/{id}/decision ·
POST records/{id}/unlink · dq/summary · dq/issues · POST dq/issues/{id}/correction · rules · POST rules/preview · POST rules · audit · audit/verify · sources
