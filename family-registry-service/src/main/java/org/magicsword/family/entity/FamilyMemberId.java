package org.magicsword.family.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

public class FamilyMemberId implements Serializable {

    private UUID familyId;
    private UUID personId;

    public FamilyMemberId() {}

    public FamilyMemberId(UUID familyId, UUID personId) {
        this.familyId = familyId;
        this.personId = personId;
    }

    public UUID getFamilyId() { return familyId; }
    public void setFamilyId(UUID familyId) { this.familyId = familyId; }
    public UUID getPersonId() { return personId; }
    public void setPersonId(UUID personId) { this.personId = personId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FamilyMemberId that)) return false;
        return Objects.equals(familyId, that.familyId) && Objects.equals(personId, that.personId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(familyId, personId);
    }
}
