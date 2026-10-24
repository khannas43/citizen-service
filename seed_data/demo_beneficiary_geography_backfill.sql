-- Backfill beneficiary district/taluka from family registry (idempotent)
SET search_path TO scheme_engine, family_registry;

UPDATE beneficiary b
SET family_district = f.district,
    family_taluka = f.taluka,
    family_village = COALESCE(b.family_village, f.village)
FROM family f
WHERE b.family_id = f.id::text
  AND (b.family_district IS NULL OR b.family_taluka IS NULL);
