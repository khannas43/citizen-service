-- Family Registry search indexes (idempotent)
-- Run once: psql -h localhost -p 5433 -U citizenuser -d citizen_db -f seed_data/family_registry_search_indexes.sql

-- pg_trgm installs operator classes in public; qualify gin_trgm_ops below.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

SET search_path TO family_registry, public;

-- Trigram GIN indexes for partial text search
CREATE INDEX IF NOT EXISTS idx_person_name_trgm
    ON family_registry.person USING gin (lower(name) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_person_occupation_trgm
    ON family_registry.person USING gin (lower(occupation) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_person_mobile_trgm
    ON family_registry.person USING gin (lower(mobile) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_family_village_trgm
    ON family_registry.family USING gin (lower(village) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_family_taluka_trgm
    ON family_registry.family USING gin (lower(taluka) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_family_district_trgm
    ON family_registry.family USING gin (lower(district) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_family_address_trgm
    ON family_registry.family USING gin (lower(address) public.gin_trgm_ops);

-- B-tree indexes for exact / filter lookups
CREATE INDEX IF NOT EXISTS idx_person_aadhaar_ref
    ON family_registry.person (aadhaar_ref);

CREATE INDEX IF NOT EXISTS idx_person_gender
    ON family_registry.person (gender);

CREATE INDEX IF NOT EXISTS idx_person_caste_category
    ON family_registry.person (caste_category);

CREATE INDEX IF NOT EXISTS idx_person_education_level
    ON family_registry.person (education_level);

CREATE INDEX IF NOT EXISTS idx_person_marital_status
    ON family_registry.person (marital_status);

CREATE INDEX IF NOT EXISTS idx_person_employment_status
    ON family_registry.person (employment_status);

CREATE INDEX IF NOT EXISTS idx_person_dob
    ON family_registry.person (dob);

CREATE INDEX IF NOT EXISTS idx_person_annual_income
    ON family_registry.person (annual_income);

CREATE INDEX IF NOT EXISTS idx_family_district_btree
    ON family_registry.family (district);

CREATE INDEX IF NOT EXISTS idx_family_state
    ON family_registry.family (state);

CREATE INDEX IF NOT EXISTS idx_family_member_person_id
    ON family_registry.family_member (person_id);

CREATE INDEX IF NOT EXISTS idx_family_member_relationship
    ON family_registry.family_member (relationship_to_head);
