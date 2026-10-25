package org.citizen.expenditure.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "master_change_log")
public class MasterChangeLog {
    /** Field name of the entry that records a pensioner's life certificate; rule S06 and the importer both use it. */
    public static final String LIFE_CERTIFICATE_FIELD = "life_certificate";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    private String personId;
    private String fieldName;
    private String oldValue;
    private String newValue;
    private String operatorId;
    private String approvalRef;
    private LocalDateTime changedAt = LocalDateTime.now();

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getPersonId() { return personId; }
    public void setPersonId(String personId) { this.personId = personId; }
    public String getFieldName() { return fieldName; }
    public void setFieldName(String fieldName) { this.fieldName = fieldName; }
    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }
    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }
    public String getOperatorId() { return operatorId; }
    public void setOperatorId(String operatorId) { this.operatorId = operatorId; }
    public String getApprovalRef() { return approvalRef; }
    public void setApprovalRef(String approvalRef) { this.approvalRef = approvalRef; }
    public LocalDateTime getChangedAt() { return changedAt; }
    public void setChangedAt(LocalDateTime changedAt) { this.changedAt = changedAt; }
}
