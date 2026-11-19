-- Binds a citizen's sign-in reference (the Aadhaar reference on the citizen portal profile) to the master person.
-- A reference that is already an identity token (IDR-...) needs no row.
CREATE TABLE IF NOT EXISTS mdm.citizen_link (
    aadhaar_ref text PRIMARY KEY,
    person_id   integer NOT NULL REFERENCES mdm.person(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text
);
CREATE INDEX IF NOT EXISTS citizen_link_person ON mdm.citizen_link(person_id);
