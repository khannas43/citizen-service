-- Version history of how each department record is tied to a person: every change of person, link status or match score
-- (automatic matching, a steward linking or separating, an unlink) adds a row. Kept by the record's own key so it survives a reload.
CREATE TABLE IF NOT EXISTS mdm.record_link_history (
    id bigserial PRIMARY KEY,
    source text NOT NULL, source_rid text NOT NULL, record_id bigint,
    ts timestamptz NOT NULL DEFAULT now(),
    event text NOT NULL,                       -- RECORDED | AUTO_LINKED | SENT_TO_REVIEW | STEWARD_LINKED | KEPT_SEPARATE | UNLINKED | MOVED | UPDATED
    from_person bigint, to_person bigint, from_status text, to_status text,
    score numeric(5,4), load_id bigint, actor text, note text, reason text
);
CREATE INDEX IF NOT EXISTS record_link_history_key ON mdm.record_link_history (source, source_rid, ts);

CREATE OR REPLACE FUNCTION mdm.log_record_link() RETURNS trigger AS $$
DECLARE ev text; act text; nt text;
BEGIN
    act := nullif(current_setting('mdm.actor', true), '');
    nt := nullif(current_setting('mdm.note', true), '');
    IF TG_OP = 'INSERT' THEN
        INSERT INTO mdm.record_link_history (source, source_rid, record_id, event, to_person, to_status, score, load_id, actor, note, reason)
        VALUES (NEW.source, NEW.source_rid, NEW.id, 'RECORDED', NEW.person_id, NEW.link_status, NEW.score, NEW.load_id, act, nt, NEW.reason);
    ELSIF NEW.link_status IS DISTINCT FROM OLD.link_status
          OR (NEW.person_id IS DISTINCT FROM OLD.person_id AND NEW.person_id IS NOT NULL)
          OR NEW.score IS DISTINCT FROM OLD.score THEN
        ev := CASE NEW.link_status
                WHEN 'STEWARD_LINKED' THEN 'STEWARD_LINKED'
                WHEN 'STEWARD_SEPARATE' THEN CASE WHEN OLD.person_id IS DISTINCT FROM NEW.person_id THEN 'UNLINKED' ELSE 'KEPT_SEPARATE' END
                WHEN 'AUTO_LINKED' THEN 'AUTO_LINKED'
                WHEN 'IN_REVIEW' THEN 'SENT_TO_REVIEW'
                ELSE CASE WHEN NEW.person_id IS DISTINCT FROM OLD.person_id THEN 'MOVED' ELSE 'UPDATED' END END;
        INSERT INTO mdm.record_link_history (source, source_rid, record_id, event, from_person, to_person, from_status, to_status, score, load_id, actor, note, reason)
        VALUES (NEW.source, NEW.source_rid, NEW.id, ev, OLD.person_id, NEW.person_id, OLD.link_status, NEW.link_status, NEW.score, NEW.load_id,
                COALESCE(act, substring(NEW.reason from ' by (.+)$')), nt, NEW.reason);
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

-- one-time backfill: where each record came in, then the steward decisions already in the audit log
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mdm.record_link_history) THEN
        INSERT INTO mdm.record_link_history (source, source_rid, record_id, ts, event, to_person, to_status, score, load_id)
        SELECT r.source, r.source_rid, r.id, COALESCE(l.finished_at, now()), 'RECORDED',
               CASE WHEN a.subject IS NOT NULL THEN NULL ELSE r.person_id END,
               CASE WHEN a.subject IS NOT NULL THEN 'IN_REVIEW' ELSE r.link_status END,
               r.score, r.load_id
        FROM mdm.source_record r LEFT JOIN mdm.load_run l ON l.id = r.load_id
        LEFT JOIN LATERAL (SELECT subject FROM mdm.audit x WHERE x.action IN ('REVIEW_LINK', 'REVIEW_SEPARATE')
                           AND x.subject = 'record:' || r.source || '/' || r.source_rid LIMIT 1) a ON true;

        INSERT INTO mdm.record_link_history (source, source_rid, record_id, ts, event, from_person, to_person, from_status, to_status, actor, note)
        SELECT substring(a.subject from '^record:([^/]+)/'), substring(a.subject from '^record:[^/]+/(.*)$'), r.id, a.ts,
               CASE a.action WHEN 'REVIEW_LINK' THEN 'STEWARD_LINKED' WHEN 'REVIEW_SEPARATE' THEN 'KEPT_SEPARATE' ELSE 'UNLINKED' END,
               nullif(a.detail->>'from_person', '')::bigint, nullif(a.detail->>'to_person', '')::bigint,
               CASE a.action WHEN 'UNLINK' THEN 'AUTO_LINKED' ELSE 'IN_REVIEW' END,
               CASE a.action WHEN 'REVIEW_LINK' THEN 'STEWARD_LINKED' ELSE 'STEWARD_SEPARATE' END,
               a.actor, a.detail->>'note'
        FROM mdm.audit a
        LEFT JOIN mdm.source_record r ON r.source = substring(a.subject from '^record:([^/]+)/') AND r.source_rid = substring(a.subject from '^record:[^/]+/(.*)$')
        WHERE a.action IN ('REVIEW_LINK', 'REVIEW_SEPARATE', 'UNLINK') AND a.subject LIKE 'record:%/%';
    END IF;
END $$;

DROP TRIGGER IF EXISTS record_link_history_trg ON mdm.source_record;
CREATE TRIGGER record_link_history_trg AFTER INSERT OR UPDATE ON mdm.source_record FOR EACH ROW EXECUTE FUNCTION mdm.log_record_link();
