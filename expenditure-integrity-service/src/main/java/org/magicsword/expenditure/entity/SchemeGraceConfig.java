package org.magicsword.expenditure.entity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "scheme_grace_config")
public class SchemeGraceConfig {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private UUID schemeId;
    private int graceDaysAfterTermination = 0;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public int getGraceDaysAfterTermination() { return graceDaysAfterTermination; }
    public void setGraceDaysAfterTermination(int graceDaysAfterTermination) { this.graceDaysAfterTermination = graceDaysAfterTermination; }
}
