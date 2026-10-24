-- One-time cleanup: the bulk identification job created duplicate
-- (person_id, scheme_id) beneficiary rows at population scale (4,059 pairs /
-- 4,383 extra rows as of 2026-07-08). Keeps the most "enriched" row per pair —
-- preferring one with disbursement data, then confirmation/override data,
-- then the earliest identified — and deletes the rest. Safe to re-run.
--
-- Partition key includes disbursement_ref: a person can legitimately have
-- more than one disbursement event on the same scheme (e.g. monthly pension
-- payouts), and those are distinct rows, not duplicates, even though they
-- share (person_id, scheme_id). An earlier version of this script keyed on
-- (person_id, scheme_id) alone and deleted one of Savitaben Patel's two real
-- Old Age Pension disbursement rows — restored manually, see chat history.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY person_id, scheme_id, COALESCE(disbursement_ref, '')
      ORDER BY
        (disbursement_status IS NOT NULL) DESC,
        (confirmed_by IS NOT NULL OR override_by IS NOT NULL) DESC,
        (status = 'REMOVED') DESC,
        identified_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM scheme_engine.beneficiary
)
DELETE FROM scheme_engine.beneficiary b
USING ranked
WHERE b.id = ranked.id
  AND ranked.rn > 1;
