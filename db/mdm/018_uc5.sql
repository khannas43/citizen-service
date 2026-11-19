-- 018_uc5.sql  (run as superuser after 017; idempotent)
-- UC5 housing check: one open proposal per person and UC5 kind.

CREATE UNIQUE INDEX IF NOT EXISTS proposal_open_uc5_ux ON mdm.proposal (person_id, kind)
  WHERE status='PROPOSED' AND kind IN ('REVIEW_DUPLICATE_BENEFIT','REVIEW_CARD_MEMBER','SETTLE_HOUSEHOLD_CONFLICT','HOUSEHOLD_NOT_FOUND');

SELECT platform.scope_all();
