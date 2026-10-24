CREATE SCHEMA IF NOT EXISTS marriage_cert;

CREATE TABLE IF NOT EXISTS marriage_cert.applications (
    engine_ref        VARCHAR(128) PRIMARY KEY,
    business_id       VARCHAR(128) NOT NULL UNIQUE,
    workflow_id       VARCHAR(64)  NOT NULL,
    applicant_name    VARCHAR(255) NOT NULL,
    spouse_name       VARCHAR(255) NOT NULL,
    tenant_id         VARCHAR(64)  NOT NULL,
    status            VARCHAR(32)  NOT NULL,
    current_task      VARCHAR(255),
    assignee          VARCHAR(255),
    candidate_groups  VARCHAR(255),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE marriage_cert.applications ADD COLUMN IF NOT EXISTS application_no VARCHAR(32);
ALTER TABLE marriage_cert.applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE marriage_cert.applications ADD COLUMN IF NOT EXISTS aadhaar_ref VARCHAR(32);
