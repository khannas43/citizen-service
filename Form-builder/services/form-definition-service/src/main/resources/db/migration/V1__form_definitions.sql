-- FB-C0: Form Definition JSONB foundation
-- Database: egov_db (PostgreSQL 16)
-- Schema: form_definition
-- Table: form_definitions
-- Primary key: (service_id, version)

CREATE SCHEMA IF NOT EXISTS form_definition;

CREATE TABLE form_definition.form_definitions (
    service_id   VARCHAR(256)  NOT NULL,
    version      INTEGER       NOT NULL,
    status       VARCHAR(32)   NOT NULL,
    definition   JSONB         NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL,
    updated_at   TIMESTAMPTZ   NOT NULL,
    lock_version BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT form_definitions_pkey PRIMARY KEY (service_id, version),
    CONSTRAINT form_definitions_service_id_nonblank
        CHECK (char_length(btrim(service_id)) > 0 AND service_id = btrim(service_id)),
    CONSTRAINT form_definitions_version_positive
        CHECK (version > 0),
    CONSTRAINT form_definitions_status_valid
        CHECK (status IN ('draft', 'submitted', 'approved', 'published', 'retired')),
    CONSTRAINT form_definitions_definition_object
        CHECK (jsonb_typeof(definition) = 'object')
);
