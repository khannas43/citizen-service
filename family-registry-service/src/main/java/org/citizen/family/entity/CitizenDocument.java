package org.citizen.family.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "citizen_document")
public class CitizenDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String aadhaarRef;

    private String docType;    // user-supplied label e.g. "Aadhaar"
    private String trustedSource; // UIDAI | DigiLocker when pulled from trusted source; null for manual upload
    private String fileName;
    private String fileType;   // MIME type

    @Column(columnDefinition = "TEXT")
    private String fileData;   // base64-encoded content

    private LocalDateTime uploadedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getAadhaarRef() { return aadhaarRef; }
    public void setAadhaarRef(String aadhaarRef) { this.aadhaarRef = aadhaarRef; }
    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public String getTrustedSource() { return trustedSource; }
    public void setTrustedSource(String trustedSource) { this.trustedSource = trustedSource; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public String getFileType() { return fileType; }
    public void setFileType(String fileType) { this.fileType = fileType; }
    public String getFileData() { return fileData; }
    public void setFileData(String fileData) { this.fileData = fileData; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(LocalDateTime uploadedAt) { this.uploadedAt = uploadedAt; }
}
