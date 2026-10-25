-- Citizen Services analytics views for Apache Superset (read-only reporting layer)
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE OR REPLACE VIEW analytics.beneficiary_by_status AS
SELECT
  status,
  COUNT(*) AS beneficiary_count,
  CASE status
    WHEN 'IDENTIFIED' THEN 1
    WHEN 'CONFIRMED' THEN 2
    WHEN 'ACTIVE' THEN 3
    WHEN 'REMOVED' THEN 4
    ELSE 5
  END AS pipeline_order
FROM scheme_engine.beneficiary
GROUP BY status;

CREATE OR REPLACE VIEW analytics.beneficiary_by_district AS
SELECT
  COALESCE(family_district, 'Unknown') AS district,
  COALESCE(family_taluka, 'Unknown') AS taluka,
  status,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW analytics.scheme_enrollment AS
SELECT
  s.name AS scheme_name,
  COALESCE(s.category, 'OTHER') AS category,
  COALESCE(s.department, 'Unknown') AS department,
  b.status,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
WHERE COALESCE(s.is_active, true) = true
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW analytics.beneficiary_caste_gender AS
SELECT
  COALESCE(caste_category, 'Unknown') AS caste_category,
  COALESCE(gender, 'Unknown') AS gender,
  status,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary
WHERE status <> 'REMOVED'
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW analytics.auto_removals AS
SELECT
  person_name,
  COALESCE(family_district, 'Unknown') AS district,
  removal_reason,
  removed_at
FROM scheme_engine.beneficiary
WHERE status = 'REMOVED'
  AND (
    UPPER(COALESCE(removal_reason, '')) LIKE '%AUTO%'
    OR UPPER(COALESCE(removal_reason, '')) LIKE '%DECEASED%'
    OR UPPER(COALESCE(removal_reason, '')) LIKE '%INCOME%'
    OR UPPER(COALESCE(removal_reason, '')) LIKE 'MEMBER_%'
  );

CREATE OR REPLACE VIEW analytics.grievance_summary AS
SELECT
  COALESCE(status, 'UNKNOWN') AS status,
  COALESCE(category, 'General') AS category,
  COALESCE(priority, 'MEDIUM') AS priority,
  COUNT(*) AS grievance_count
FROM grievance.grievance
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW analytics.family_by_district AS
SELECT
  COALESCE(district, 'Unknown') AS district,
  COALESCE(taluka, 'Unknown') AS taluka,
  COUNT(*) AS family_count
FROM family_registry.family
GROUP BY 1, 2;

CREATE OR REPLACE VIEW analytics.platform_snapshot AS
SELECT
  (SELECT COUNT(*) FROM family_registry.family) AS total_families,
  (SELECT COUNT(*) FROM family_registry.person) AS total_persons,
  (SELECT COUNT(*) FROM scheme_engine.beneficiary WHERE status <> 'REMOVED') AS active_beneficiaries,
  (SELECT COUNT(*) FROM scheme_engine.scheme WHERE COALESCE(is_active, true) = true) AS active_schemes,
  (SELECT COUNT(*) FROM grievance.grievance WHERE status IN ('OPEN', 'IN_PROGRESS', 'PENDING')) AS open_grievances,
  (SELECT COUNT(*) FROM scheme_engine.beneficiary WHERE status = 'IDENTIFIED') AS pending_confirmation;

CREATE OR REPLACE VIEW analytics.platform_kpis AS
SELECT 'Active Beneficiaries' AS kpi_name, active_beneficiaries::numeric AS kpi_value
FROM analytics.platform_snapshot
UNION ALL
SELECT 'Families Registered', total_families::numeric FROM analytics.platform_snapshot
UNION ALL
SELECT 'Pending Confirmation', pending_confirmation::numeric FROM analytics.platform_snapshot
UNION ALL
SELECT 'Total Identified', pending_confirmation::numeric FROM analytics.platform_snapshot
UNION ALL
SELECT 'Total Active', active_beneficiaries::numeric FROM analytics.platform_snapshot;

GRANT USAGE ON SCHEMA analytics TO citizenuser;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO citizenuser;
