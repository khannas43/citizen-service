-- 001_platform.sql  (run as the database owner / superuser, once per database; idempotent)
-- Creates the state-neutral `platform` schema used by every service.
-- Existing behaviour is unchanged: when a connection does not say which state it serves,
-- platform.current_state() returns the default state (GJ, the DG2.0 sample data).

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.state (
    code               char(2)      PRIMARY KEY,                 -- ISO 3166-2:IN suffix: GJ, TG, TN ...
    name_en            text         NOT NULL,
    name_local         jsonb        NOT NULL DEFAULT '{}',       -- {"te":"తెలంగాణ"}
    languages          text[]       NOT NULL DEFAULT '{en}',
    default_lang       text         NOT NULL DEFAULT 'en',
    digit_tenant_id    text,                                     -- DIGIT tenant id for this state
    admin_level_labels jsonb        NOT NULL DEFAULT '{}',       -- {"1":"District","2":"Taluka","3":"Village"}
    id_formats         jsonb        NOT NULL DEFAULT '{}',       -- ration card / family ID patterns
    is_default         boolean      NOT NULL DEFAULT false,
    active             boolean      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS state_single_default ON platform.state ((is_default)) WHERE is_default;

CREATE TABLE IF NOT EXISTS platform.admin_unit (
    id          bigserial    PRIMARY KEY,
    state_code  char(2)      NOT NULL REFERENCES platform.state(code),
    level       smallint     NOT NULL,                           -- 1 district, 2 sub-district (Taluka/Mandal/Block) ...
    parent_id   bigint       REFERENCES platform.admin_unit(id),
    lgd_code    text,                                            -- Local Government Directory code
    name_en     text         NOT NULL,
    name_local  jsonb        NOT NULL DEFAULT '{}',
    kind        text                                             -- rural / urban, ward, village, city ...
);
-- identity of a unit: its LGD code when it has one, otherwise (parent, name). Villages in one mandal can share a name.
CREATE UNIQUE INDEX IF NOT EXISTS admin_unit_lgd_key
    ON platform.admin_unit (state_code, level, lgd_code) WHERE lgd_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admin_unit_name_key
    ON platform.admin_unit (state_code, level, (coalesce(parent_id, 0)), name_en) WHERE lgd_code IS NULL;
CREATE INDEX IF NOT EXISTS admin_unit_state_level ON platform.admin_unit (state_code, level);
CREATE INDEX IF NOT EXISTS admin_unit_parent ON platform.admin_unit (parent_id);

CREATE TABLE IF NOT EXISTS platform.scheme_catalog (
    id          bigserial    PRIMARY KEY,
    state_code  char(2)      REFERENCES platform.state(code),    -- NULL = central scheme, visible to every state
    level       text         NOT NULL CHECK (level IN ('CENTRAL','STATE')),
    code        text         NOT NULL,
    name_en     text         NOT NULL,
    name_local  jsonb        NOT NULL DEFAULT '{}',
    category    text,
    source_url  text,                                            -- where the entry came from
    verified    boolean      NOT NULL DEFAULT false,         -- checked against the department's own notification
    active      boolean      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS scheme_catalog_code ON platform.scheme_catalog (coalesce(state_code, '--'), code);

CREATE TABLE IF NOT EXISTS platform.i18n_label (
    state_code  char(2)      REFERENCES platform.state(code),    -- NULL = all states
    lang        text         NOT NULL,
    key         text         NOT NULL,
    text        text         NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS i18n_label_key ON platform.i18n_label (coalesce(state_code, '--'), lang, key);

-- Schemas whose tables get a state_code column and row-level security (see 002).
CREATE TABLE IF NOT EXISTS platform.managed_schema (
    schema_name text PRIMARY KEY
);

INSERT INTO platform.state (code, name_en, name_local, languages, default_lang, digit_tenant_id, admin_level_labels, is_default)
VALUES
 ('GJ','Gujarat',   '{"gu":"ગુજરાત"}',    '{en,gu}', 'gu', 'pg', '{"1":"District","2":"Taluka","3":"Village"}', true),
 ('TG','Telangana', '{"te":"తెలంగాణ"}',  '{en,te}', 'te', 'tg', '{"1":"District","2":"Mandal","3":"Village"}', false),
 ('TN','Tamil Nadu','{"ta":"தமிழ்நாடு"}', '{en,ta}', 'ta', 'tn', '{"1":"District","2":"Taluk","3":"Village"}',  false)
ON CONFLICT (code) DO NOTHING;

-- The state a database session serves. Services set it with: SELECT set_config('app.state_code', 'TG', false).
-- Unset or empty -> the default state, so unmodified code keeps working exactly as before.
CREATE OR REPLACE FUNCTION platform.current_state() RETURNS char(2)
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('app.state_code', true), ''),
        (SELECT code FROM platform.state WHERE is_default LIMIT 1)
    )::char(2)
$$;
