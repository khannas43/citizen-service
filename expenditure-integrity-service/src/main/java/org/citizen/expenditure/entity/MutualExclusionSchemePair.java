package org.citizen.expenditure.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "mutual_exclusion_scheme_pair")
public class MutualExclusionSchemePair {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private UUID schemeIdA;
    private UUID schemeIdB;
    private String note;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeIdA() { return schemeIdA; }
    public void setSchemeIdA(UUID schemeIdA) { this.schemeIdA = schemeIdA; }
    public UUID getSchemeIdB() { return schemeIdB; }
    public void setSchemeIdB(UUID schemeIdB) { this.schemeIdB = schemeIdB; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
