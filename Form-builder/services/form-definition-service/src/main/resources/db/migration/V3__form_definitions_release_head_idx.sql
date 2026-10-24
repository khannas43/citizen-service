-- FB-C5: release-head lookup index for published/retired rows.
-- Supports: highest (service_id, version DESC) among release statuses.
-- V1 and V2 are unchanged.

CREATE INDEX form_definitions_release_head_idx
    ON form_definition.form_definitions (service_id, version DESC)
    WHERE status IN ('published', 'retired');
