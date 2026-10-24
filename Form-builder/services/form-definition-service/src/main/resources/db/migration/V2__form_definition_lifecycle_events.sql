-- FB-C4: append-only Form Definition lifecycle event log
-- Does not modify V1 form_definitions.

CREATE TABLE form_definition.form_definition_lifecycle_events (
    event_id            BIGSERIAL       NOT NULL,
    service_id          VARCHAR(256)    NOT NULL,
    version             INTEGER         NOT NULL,
    from_status         VARCHAR(32)     NOT NULL,
    to_status           VARCHAR(32)     NOT NULL,
    actor_id            VARCHAR(256)    NOT NULL,
    occurred_at         TIMESTAMPTZ     NOT NULL,
    resulting_revision  BIGINT          NOT NULL,
    CONSTRAINT form_definition_lifecycle_events_pkey PRIMARY KEY (event_id),
    CONSTRAINT form_definition_lifecycle_events_fk
        FOREIGN KEY (service_id, version)
        REFERENCES form_definition.form_definitions (service_id, version),
    CONSTRAINT form_definition_lifecycle_events_from_status_valid
        CHECK (from_status IN ('draft', 'submitted', 'approved', 'published', 'retired')),
    CONSTRAINT form_definition_lifecycle_events_to_status_valid
        CHECK (to_status IN ('draft', 'submitted', 'approved', 'published', 'retired')),
    CONSTRAINT form_definition_lifecycle_events_forward_only
        CHECK (
            (from_status = 'draft' AND to_status = 'submitted')
            OR (from_status = 'submitted' AND to_status = 'approved')
            OR (from_status = 'approved' AND to_status = 'published')
            OR (from_status = 'published' AND to_status = 'retired')
        ),
    CONSTRAINT form_definition_lifecycle_events_actor_nonblank
        CHECK (char_length(btrim(actor_id)) > 0 AND actor_id = btrim(actor_id)),
    CONSTRAINT form_definition_lifecycle_events_uq_target
        UNIQUE (service_id, version, to_status)
);

CREATE INDEX form_definition_lifecycle_events_def_idx
    ON form_definition.form_definition_lifecycle_events (service_id, version, event_id);
