-- Citizen Services Superset Dashboard Views v2.0
-- Run as: psql -U citizenuser -d citizen_db -f superset_dashboard_views.sql

CREATE SCHEMA IF NOT EXISTS reference;

CREATE TABLE IF NOT EXISTS reference.gujarat_district_population (
  district         VARCHAR(100) PRIMARY KEY,
  population_2011  INTEGER,
  estimated_2026   INTEGER
);

TRUNCATE reference.gujarat_district_population;

INSERT INTO reference.gujarat_district_population (district, population_2011, estimated_2026) VALUES
  ('Ahmedabad',       7214225,  9200000),
  ('Surat',           6081322,  7800000),
  ('Vadodara',        4157568,  5200000),
  ('Rajkot',          3804558,  4800000),
  ('Bhavnagar',       2877961,  3500000),
  ('Jamnagar',        2160119,  2700000),
  ('Junagadh',        2743082,  3300000),
  ('Gandhinagar',     1387478,  1900000),
  ('Anand',           2090276,  2500000),
  ('Kheda',           2298934,  2800000),
  ('Mehsana',         2027727,  2500000),
  ('Banaskantha',     3120673,  3900000),
  ('Patan',           1343734,  1600000),
  ('Sabarkantha',     2427346,  3000000),
  ('Aravalli',        1012883,  1200000),
  ('Kutch',           2092371,  2600000),
  ('Morbi',            994687,  1200000),
  ('Surendranagar',   1756268,  2100000),
  ('Botad',            653406,   780000),
  ('Amreli',          1514190,  1800000),
  ('Gir Somnath',     1223479,  1500000),
  ('Porbandar',        585449,   700000),
  ('Devbhumi Dwarka',  762771,   920000),
  ('Narmada',          590379,   720000),
  ('Bharuch',         1551026,  1900000),
  ('Tapi',             807022,   980000),
  ('Navsari',         1329672,  1600000),
  ('Valsad',          1703068,  2100000),
  ('Dang',             226769,   270000),
  ('Dahod',           2127086,  2600000),
  ('Panchmahals',     2390776,  2900000),
  ('Mahisagar',        994624,  1200000)
ON CONFLICT (district) DO NOTHING;

GRANT USAGE ON SCHEMA reference TO citizenuser;
GRANT SELECT ON ALL TABLES IN SCHEMA reference TO citizenuser;

CREATE OR REPLACE VIEW analytics.beneficiary_growth_weekly AS
WITH weekly AS (
  SELECT
    DATE_TRUNC('week', identified_at)::date AS week_start,
    scheme_id,
    COUNT(*) AS newly_identified
  FROM scheme_engine.beneficiary
  WHERE identified_at >= CURRENT_DATE - INTERVAL '12 weeks'
    AND status <> 'REMOVED'
  GROUP BY 1, 2
)
SELECT
  week_start,
  scheme_id,
  newly_identified,
  SUM(newly_identified) OVER (
    PARTITION BY scheme_id
    ORDER BY week_start
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS cumulative_total
FROM weekly;

CREATE OR REPLACE VIEW analytics.beneficiary_income_bands AS
SELECT
  b.scheme_id,
  s.name AS scheme_name,
  COALESCE(b.status, 'UNKNOWN') AS status,
  CASE
    WHEN p.annual_income IS NULL       THEN 'Unknown'
    WHEN p.annual_income = 0           THEN '₹0'
    WHEN p.annual_income <= 25000      THEN '₹1–25k'
    WHEN p.annual_income <= 50000      THEN '₹25–50k'
    WHEN p.annual_income <= 75000      THEN '₹50–75k'
    WHEN p.annual_income <= 100000     THEN '₹75k–1L'
    WHEN p.annual_income <= 150000     THEN '₹1L–1.5L'
    WHEN p.annual_income <= 200000     THEN '₹1.5L–2L'
    WHEN p.annual_income <= 300000     THEN '₹2L–3L'
    WHEN p.annual_income <= 500000     THEN '₹3L–5L'
    ELSE '₹5L+'
  END AS income_band,
  CASE
    WHEN p.annual_income IS NULL THEN 0
    WHEN p.annual_income = 0     THEN 0
    WHEN p.annual_income <= 25000 THEN 1
    WHEN p.annual_income <= 50000 THEN 2
    WHEN p.annual_income <= 75000 THEN 3
    WHEN p.annual_income <= 100000 THEN 4
    WHEN p.annual_income <= 150000 THEN 5
    WHEN p.annual_income <= 200000 THEN 6
    WHEN p.annual_income <= 300000 THEN 7
    WHEN p.annual_income <= 500000 THEN 8
    ELSE 9
  END AS band_order,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary b
JOIN family_registry.person p ON p.id::text = b.person_id
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
WHERE b.status <> 'REMOVED'
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW analytics.fraud_signal_summary AS
WITH multi_scheme AS (
  SELECT COUNT(*) AS cnt
  FROM (
    SELECT person_id
    FROM scheme_engine.beneficiary
    WHERE status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
    GROUP BY person_id
    HAVING COUNT(DISTINCT scheme_id) > 1
  ) overlap_persons
),
age_anomaly AS (
  SELECT COUNT(*) AS cnt
  FROM scheme_engine.beneficiary b
  JOIN family_registry.person p ON p.id::text = b.person_id
  WHERE b.status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
    AND p.dob IS NOT NULL
    AND (
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) > 100
      OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 3
    )
),
income_cliff AS (
  SELECT COUNT(*) AS cnt
  FROM family_registry.person p
  JOIN scheme_engine.beneficiary b ON b.person_id = p.id::text
  WHERE b.status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
    AND p.annual_income BETWEEN 127500 AND 150000
),
family_mismatch AS (
  SELECT COUNT(DISTINCT fm.family_id) AS cnt
  FROM family_registry.family_member fm
  JOIN family_registry.person p_dead
    ON p_dead.id = fm.person_id
   AND COALESCE(p_dead.is_alive, true) = false
   AND COALESCE(p_dead.annual_income, 0) > 100000
  WHERE EXISTS (
    SELECT 1
    FROM scheme_engine.beneficiary b
    WHERE b.family_id = fm.family_id::text
      AND b.status IN ('IDENTIFIED', 'CONFIRMED', 'ACTIVE')
  )
)
SELECT 'MULTI_SCHEME_OVERLAP' AS signal_type, (SELECT cnt FROM multi_scheme) AS signal_count, 1 AS sort_order
UNION ALL
SELECT 'AGE_ANOMALY', (SELECT cnt FROM age_anomaly), 2
UNION ALL
SELECT 'INCOME_CLIFF', (SELECT cnt FROM income_cliff), 3
UNION ALL
SELECT 'FAMILY_INCOME_MISMATCH', (SELECT cnt FROM family_mismatch), 4;

CREATE OR REPLACE VIEW analytics.scheme_caste_breakdown AS
SELECT
  s.name AS scheme_name,
  COALESCE(b.caste_category, 'Unknown') AS caste_category,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')
GROUP BY 1, 2;

CREATE OR REPLACE VIEW analytics.processing_time_weekly AS
SELECT
  DATE_TRUNC('week', confirmed_at)::date AS week_start,
  s.name AS scheme_name,
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (confirmed_at - identified_at)) / 86400.0
    )::numeric,
    1
  ) AS avg_days_to_confirm,
  COUNT(*) AS confirmed_count
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
WHERE confirmed_at IS NOT NULL
  AND identified_at IS NOT NULL
  AND confirmed_at >= CURRENT_DATE - INTERVAL '10 weeks'
  AND confirmed_at > identified_at
GROUP BY 1, 2;

CREATE OR REPLACE VIEW analytics.processing_kpi AS
SELECT
  'Avg Processing Days' AS kpi_name,
  COALESCE(ROUND(AVG(avg_days_to_confirm)::numeric, 1), 0) AS kpi_value
FROM analytics.processing_time_weekly;

CREATE OR REPLACE VIEW analytics.beneficiary_age_bands AS
SELECT
  s.name AS scheme_name,
  CASE
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 5   THEN '0–4'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 15  THEN '5–14'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 25  THEN '15–24'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 35  THEN '25–34'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 45  THEN '35–44'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 55  THEN '45–54'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 65  THEN '55–64'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 75  THEN '65–74'
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 100 THEN '75–99'
    ELSE '100+'
  END AS age_band,
  CASE
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 5   THEN 1
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 15  THEN 2
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 25  THEN 3
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 35  THEN 4
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 45  THEN 5
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 55  THEN 6
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 65  THEN 7
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 75  THEN 8
    WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.dob)) < 100 THEN 9
    ELSE 10
  END AS band_order,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
JOIN family_registry.person p ON p.id::text = b.person_id
WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')
  AND p.dob IS NOT NULL
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW analytics.beneficiary_gender_marital AS
SELECT
  s.name AS scheme_name,
  COALESCE(b.gender, p.gender, 'Unknown') AS gender,
  COALESCE(p.marital_status, 'Unknown') AS marital_status,
  COUNT(*) AS beneficiary_count
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
JOIN family_registry.person p ON p.id::text = b.person_id
WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW analytics.scheme_district_penetration AS
SELECT
  s.name AS scheme_name,
  COALESCE(b.family_district, 'Unknown') AS district,
  COUNT(*) AS beneficiary_count,
  COALESCE(dp.estimated_2026, 1000000) AS district_pop_2026,
  ROUND(
    COUNT(*) * 100.0 / NULLIF(COALESCE(dp.estimated_2026, 1000000), 0),
    2
  ) AS penetration_pct
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
LEFT JOIN reference.gujarat_district_population dp
  ON LOWER(dp.district) = LOWER(COALESCE(b.family_district, ''))
WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')
GROUP BY 1, 2, dp.estimated_2026;

CREATE OR REPLACE VIEW analytics.scheme_taluka_top AS
SELECT
  s.name AS scheme_name,
  COALESCE(b.family_district, 'Unknown') AS district,
  COALESCE(b.family_taluka, 'Unknown') AS taluka,
  COUNT(*) AS beneficiary_count,
  RANK() OVER (
    PARTITION BY s.name
    ORDER BY COUNT(*) DESC
  ) AS taluka_rank
FROM scheme_engine.beneficiary b
JOIN scheme_engine.scheme s ON s.id = b.scheme_id
WHERE b.status IN ('CONFIRMED', 'ACTIVE', 'IDENTIFIED')
GROUP BY 1, 2, 3;

GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO citizenuser;
GRANT SELECT ON ALL TABLES IN SCHEMA reference TO citizenuser;
