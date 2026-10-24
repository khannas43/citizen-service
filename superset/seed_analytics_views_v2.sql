-- DG 2.0 analytics views v2 — cross-domain grievance correlation
-- Run as: psql -U egovuser -d egov_db -f seed_analytics_views_v2.sql
-- Joins grievance.grievance to family_registry via aadhaar_ref (grievances carry no
-- district/taluka of their own), then correlates against beneficiary volume per district
-- so districts with disproportionate grievance load stand out, not just raw counts.

CREATE OR REPLACE VIEW analytics.grievance_correlation_by_district AS
WITH grievance_by_district AS (
  SELECT
    COALESCE(f.district, 'Unknown') AS district,
    COUNT(*) AS grievance_count
  FROM grievance.grievance g
  JOIN family_registry.person p ON p.aadhaar_ref = g.aadhaar_ref
  JOIN family_registry.family_member fm ON fm.person_id = p.id
  JOIN family_registry.family f ON f.id = fm.family_id
  GROUP BY 1
),
beneficiary_by_district AS (
  SELECT
    COALESCE(family_district, 'Unknown') AS district,
    COUNT(*) AS beneficiary_count
  FROM scheme_engine.beneficiary
  WHERE status <> 'REMOVED'
  GROUP BY 1
)
SELECT
  COALESCE(g.district, b.district) AS district,
  COALESCE(g.grievance_count, 0) AS grievance_count,
  COALESCE(b.beneficiary_count, 0) AS beneficiary_count,
  ROUND(
    COALESCE(g.grievance_count, 0) * 1000.0 / NULLIF(COALESCE(b.beneficiary_count, 0), 0),
    2
  ) AS grievances_per_1000_beneficiaries
FROM grievance_by_district g
FULL OUTER JOIN beneficiary_by_district b ON b.district = g.district;

GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO egovuser;
