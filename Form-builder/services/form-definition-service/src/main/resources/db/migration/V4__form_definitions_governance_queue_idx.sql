-- FB-E1: governance queue keyset index for submitted/approved rows.
-- Supports ascending (service_id, version) pagination without scanning other statuses.
-- V1–V3 are unchanged.

CREATE INDEX form_definitions_governance_queue_idx
    ON form_definition.form_definitions (service_id, version ASC)
    WHERE status IN ('submitted', 'approved');
