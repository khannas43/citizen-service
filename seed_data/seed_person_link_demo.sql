-- Links two demo employees to beneficiaries who already have open alerts (person view demo).
-- Does not touch GJ-BAN-DEESA-01 (rule 807 demo uses Bharti Darji on that code).
-- Undo: seed_person_link_demo_undo.sql
SET search_path TO expenditure_integrity;

UPDATE employee_identity SET person_id = '50000005-0000-0000-0000-000000000001'
 WHERE employee_code = 'GJ-BAN-DEESA-02';

UPDATE employee_identity SET person_id = '01c94a00-d6ba-4bb9-abf4-d81363b572a1'
 WHERE employee_code = 'GJ-BAN-DEESA-12';
