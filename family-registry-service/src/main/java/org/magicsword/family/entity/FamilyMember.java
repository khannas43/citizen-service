package org.magicsword.family.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "family_member")
@IdClass(FamilyMemberId.class)
public class FamilyMember {

    @Id
    @Column(name = "family_id")
    private UUID familyId;

    @Id
    @Column(name = "person_id")
    private UUID personId;

    private String relationshipToHead;

    public UUID getFamilyId() { return familyId; }
    public void setFamilyId(UUID familyId) { this.familyId = familyId; }
    public UUID getPersonId() { return personId; }
    public void setPersonId(UUID personId) { this.personId = personId; }
    public String getRelationshipToHead() { return relationshipToHead; }
    public void setRelationshipToHead(String relationshipToHead) { this.relationshipToHead = relationshipToHead; }
}
