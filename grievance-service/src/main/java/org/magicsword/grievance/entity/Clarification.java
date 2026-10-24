package org.magicsword.grievance.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "clarification")
public class Clarification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "application_ref")
    private String applicationRef;

    @Column(name = "aadhaar_ref")
    private String aadhaarRef;

    @Column(name = "citizen_name")
    private String citizenName;

    @Column(name = "service_name")
    private String serviceName;

    @Column(name = "question", columnDefinition = "TEXT")
    private String question;

    @Column(name = "answer", columnDefinition = "TEXT")
    private String answer;

    @Column(name = "asked_at")
    private LocalDateTime askedAt = LocalDateTime.now();

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @Column(name = "status")
    private String status = "PENDING";

    /** CITIZEN_TO_OFFICER = citizen asks; OFFICER_TO_CITIZEN = officer requests info */
    @Column(name = "direction")
    private String direction = "CITIZEN_TO_OFFICER";

    @Column(name = "officer_name")
    private String officerName;

    @Column(name = "display_ref")
    private String displayRef;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getApplicationRef() { return applicationRef; }
    public void setApplicationRef(String applicationRef) { this.applicationRef = applicationRef; }

    public String getAadhaarRef() { return aadhaarRef; }
    public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }

    public String getCitizenName() { return citizenName; }
    public void setCitizenName(String citizenName) { this.citizenName = citizenName; }

    public String getServiceName() { return serviceName; }
    public void setServiceName(String serviceName) { this.serviceName = serviceName; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }

    public LocalDateTime getAskedAt() { return askedAt; }
    public void setAskedAt(LocalDateTime askedAt) { this.askedAt = askedAt; }

    public LocalDateTime getAnsweredAt() { return answeredAt; }
    public void setAnsweredAt(LocalDateTime answeredAt) { this.answeredAt = answeredAt; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }

    public String getOfficerName() { return officerName; }
    public void setOfficerName(String officerName) { this.officerName = officerName; }

    public String getDisplayRef() { return displayRef; }
    public void setDisplayRef(String displayRef) { this.displayRef = displayRef; }
}
