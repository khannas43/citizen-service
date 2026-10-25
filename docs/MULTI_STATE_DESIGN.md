# Citizen Services: multi-state design (draft for review)

Goal: one code base. First state is Telangana; Tamil Nadu and others follow. The state a user belongs to
decides the citizen data, geography, schemes, language and labels they see. Gujarat (from DG2.0) is
the existing sample data and becomes one more state pack.

## 1. Tenant = state
- Tenant key: `state_code` (ISO 3166-2:IN suffix: `TG`, `TN`, `GJ`).
- One Keycloak realm (`citizen`). Each user has an attribute `state_code`; a protocol mapper puts it in the
  JWT as claim `state`. Change the login, change the state. No code change.
- Each service reads the claim and runs `SET LOCAL app.state_code = '<code>'` at the start of every
  transaction (one servlet filter + one JDBC/Hibernate hook, shared library).
- DIGIT's `tenantId` (today `pg`) is derived from `state_code` (e.g. `tg`), so the DIGIT services follow.

## 2. Two deployment modes, same code
| Mode | Use | Isolation |
| --- | --- | --- |
| Shared DB, many states | dev, demo, sales | row-level security on `state_code` |
| One deployment per state | production | separate DB, cluster, keys (matches state data-centre and sovereignty rules) |

## 3. Database layout in `citizen_db`
New schema `platform` (state-neutral):
- `platform.state(code, name_en, name_local jsonb, languages text[], default_lang, digit_tenant_id, admin_level_labels jsonb, id_formats jsonb)`
  Example labels: Telangana level 3 = Mandal; Gujarat level 3 = Taluka; Tamil Nadu level 3 = Taluk / Block.
- `platform.admin_unit(id, state_code, level int, parent_id, lgd_code, name_en, name_local jsonb, kind)`
  One table for State > District > (Division) > Mandal/Taluka/Block > Village/Ward/City.
  Source: Local Government Directory (LGD), the national master. Loaded per state pack.
- `platform.scheme(id, state_code NULL = central scheme visible to all states, level CENTRAL|STATE, ...)`
- `platform.i18n_label(state_code NULL = all, lang, key, text)`

Existing service schemas (`family_registry`, `scheme_engine`, `grievance`, `pension`, ...):
- Add `state_code char(2) NOT NULL DEFAULT current_setting('app.state_code')` to every business table, indexed
  first in composite indexes.
- Add `admin_unit_id` FK where today there are free-text `district / taluka / village / city` columns.
  Keep the text columns for now (filled from `admin_unit`) so existing queries and the officer portal keep working,
  then retire them.
- Row-level security: `USING (state_code = current_setting('app.state_code', true))`. The services connect
  as a non-owner role so RLS applies. Migrations run as owner.
- Reference tables such as `reference.gujarat_district_population` become `platform`/`reference` tables keyed by state.

## 4. State packs
`state-packs/<code>/` holds: admin units (LGD export), scheme catalogue, languages and labels,
ID formats (ration card, family ID), sample/demo data, Keycloak users and roles for that state.
Loading a pack is idempotent. `GJ` is built first from the current seed data (proves the model without changing
behaviour), then `TG`.

## 5. Language
- Locale packs per language: `en`, `te`, `ta`, `gu`. Today only `en` and `gu` exist in the portals and the mobile app.
- Telugu first: add `te` UI strings, Telugu chatbot text, Telugu speech (the Whisper-based STT supports Telugu) and
  Telugu NLP for eligibility extraction (the Gujarati module `ai-intelligence-service/app/gujarati_text.py`
  needs a Telugu counterpart; it is the largest single item).
- The language list comes from `platform.state.languages`, not from code.

## 6. Work order
1. Foundation: `platform` schema, `state_code` on tables, RLS, JWT claim, tenant filter (Gujarat as `GJ`, no behaviour change).
2. State pack loader and LGD import; geography via `admin_unit`; UI pickers read the state's level labels.
3. Telangana pack: admin units, schemes, demo citizens (synthetic), Keycloak users.
4. Telugu: UI, chatbot, speech, NLP.
5. Tamil Nadu pack (Tamil locale), reusing steps 1 to 4.

## 7. Open decisions
- Which Telangana schemes go into the first catalogue (state and central).
- Whether production Telangana runs as its own deployment (recommended) or inside a shared one.
- Source of Telangana demo citizens: synthetic only (recommended). Do not load real citizen data into the demo.

## 8. Step 1 status (25 Oct 2026)
Written: `db/platform/001-003` (tested on a scratch Postgres 16: state isolation, default state, cross-state insert blocked,
tables created later scoped automatically, app role is not superuser), `platform-tenancy` library (token claim extractor
and context tested; the Spring wiring is not yet compiled because Maven Central was not reachable from the build machine),
`state` claim and `state_code` attribute in Keycloak (`citizen-realm.json`, `setup-keycloak.sh`), dependency added to the
ten database services. Not yet run against the cluster.

## 9. Step 2 status (25 Oct 2026)
`scripts/load_state_pack.py` and `state-packs/` (GJ, TG skeleton, test fixture). GJ geography comes from the DG2.0 seed (not LGD).
Telangana geography needs the LGD download (lgdirectory.gov.in) saved in `state-packs/TG/lgd/`; the India Data portal copy is from 2023.
Telangana scheme catalogue not started: needs the list of schemes to include.
