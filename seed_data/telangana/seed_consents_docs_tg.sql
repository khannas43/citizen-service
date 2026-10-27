-- Telangana DEMO consents + document vault entries (family_registry). Idempotent (ids are derived from the Aadhaar ref).
-- Run as the superuser:  psql -d citizen_db -v ON_ERROR_STOP=1 -f seed_data/telangana/seed_consents_docs_tg.sql
SELECT set_config('app.state_code', 'TG', false);
SET search_path TO family_registry;

DELETE FROM consent WHERE id::text LIKE 'c7600000-%';
DELETE FROM citizen_document WHERE file_name LIKE 'SAMPLE-%';

-- Heads of family: the 5 hero families (all) + about 1 in 8 of the rest.
CREATE TEMP TABLE _heads AS
SELECT p.aadhaar_ref, abs(hashtext(p.aadhaar_ref)) AS h,
       (p.aadhaar_ref IN ('XXXX-XXXX-1001','XXXX-XXXX-2001','XXXX-XXXX-3001','XXXX-XXXX-4001','XXXX-XXXX-5001')) AS hero
FROM family_member fm JOIN person p ON p.id = fm.person_id
WHERE fm.relationship_to_head = 'HEAD' AND p.aadhaar_ref IS NOT NULL;
DELETE FROM _heads WHERE NOT hero AND h % 8 <> 0;

-- 1) active consent: Social Welfare
INSERT INTO consent (id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at)
SELECT ('c7600000-0000-4000-8000-' || substr(md5(aadhaar_ref || 'a'), 1, 12))::uuid, aadhaar_ref,
       'Social Welfare Department', 'Income & Caste Records', 'Eligibility verification for welfare and scholarship schemes',
       'ACTIVE', NOW() - ((h % 40 + 10) || ' days')::interval, NULL FROM _heads;
-- 2) active consent: Rural Development (SERP)
INSERT INTO consent (id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at)
SELECT ('c7600000-0000-4000-8000-' || substr(md5(aadhaar_ref || 'b'), 1, 12))::uuid, aadhaar_ref,
       'Rural Development (SERP) Department', 'Family & Age Records', 'Aasara / Cheyutha pension eligibility check for family members',
       'ACTIVE', NOW() - ((h % 25 + 5) || ' days')::interval, NULL FROM _heads;
-- 3) revoked consent: Civil Supplies (for about half, always for heroes)
INSERT INTO consent (id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at)
SELECT ('c7600000-0000-4000-8000-' || substr(md5(aadhaar_ref || 'c'), 1, 12))::uuid, aadhaar_ref,
       'Civil Supplies Department', 'Income Records', 'Ration card verification',
       'REVOKED', NOW() - interval '60 days', NOW() - interval '5 days' FROM _heads WHERE hero OR h % 2 = 0;
-- 4) active consent: Agriculture (heroes only)
INSERT INTO consent (id, aadhaar_ref, department, data_category, purpose, status, granted_at, revoked_at)
SELECT ('c7600000-0000-4000-8000-' || substr(md5(aadhaar_ref || 'd'), 1, 12))::uuid, aadhaar_ref,
       'Agriculture Department', 'Land & Occupation Records', 'Rythu scheme beneficiary verification',
       'ACTIVE', NOW() - interval '15 days', NULL FROM _heads WHERE hero;

-- Document vault: sample placeholders only (NOT real documents). base64 of "SAMPLE DOCUMENT - DEMO ONLY".
INSERT INTO citizen_document (id, aadhaar_ref, doc_type, trusted_source, file_name, file_type, file_data, uploaded_at)
SELECT gen_random_uuid(), aadhaar_ref, 'Aadhaar', 'UIDAI', 'SAMPLE-aadhaar-' || right(aadhaar_ref, 4) || '.txt', 'text/plain',
       'U0FNUExFIERPQ1VNRU5UIC0gREVNTyBPTkxZ', NOW() - interval '30 days' FROM _heads WHERE hero;
INSERT INTO citizen_document (id, aadhaar_ref, doc_type, trusted_source, file_name, file_type, file_data, uploaded_at)
SELECT gen_random_uuid(), aadhaar_ref, 'Ration Card', 'DigiLocker', 'SAMPLE-ration-card-' || right(aadhaar_ref, 4) || '.txt', 'text/plain',
       'U0FNUExFIERPQ1VNRU5UIC0gREVNTyBPTkxZ', NOW() - interval '29 days' FROM _heads WHERE hero;
INSERT INTO citizen_document (id, aadhaar_ref, doc_type, trusted_source, file_name, file_type, file_data, uploaded_at)
SELECT gen_random_uuid(), aadhaar_ref, 'Income Certificate', NULL, 'SAMPLE-income-cert-' || right(aadhaar_ref, 4) || '.txt', 'text/plain',
       'U0FNUExFIERPQ1VNRU5UIC0gREVNTyBPTkxZ', NOW() - interval '20 days' FROM _heads WHERE hero;

SELECT 'consents' AS what, count(*) FROM consent WHERE id::text LIKE 'c7600000-%'
UNION ALL SELECT 'documents', count(*) FROM citizen_document WHERE file_name LIKE 'SAMPLE-%';
