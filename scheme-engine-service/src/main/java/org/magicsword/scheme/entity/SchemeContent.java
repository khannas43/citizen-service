package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import org.magicsword.scheme.config.SchemeContentDocumentsConverter;
import org.magicsword.scheme.config.SchemeContentFaqsConverter;
import org.magicsword.scheme.config.SchemeContentStepsConverter;
import org.magicsword.scheme.model.content.SchemeContentDocumentItem;
import org.magicsword.scheme.model.content.SchemeContentFaqItem;
import org.magicsword.scheme.model.content.SchemeContentStepItem;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "scheme_content")
public class SchemeContent {

    @Id
    @Column(name = "scheme_id")
    private UUID schemeId;

    @Convert(converter = SchemeContentDocumentsConverter.class)
    @Column(name = "documents_required", columnDefinition = "text")
    private List<SchemeContentDocumentItem> documentsRequired = new ArrayList<>();

    @Convert(converter = SchemeContentStepsConverter.class)
    @Column(name = "application_steps", columnDefinition = "text")
    private List<SchemeContentStepItem> applicationSteps = new ArrayList<>();

    @Convert(converter = SchemeContentFaqsConverter.class)
    @Column(name = "faqs", columnDefinition = "text")
    private List<SchemeContentFaqItem> faqs = new ArrayList<>();

    /** Officer-written wording for the citizen page; null/blank falls back to the scheme record. */
    @Column(name = "overview", columnDefinition = "text")
    private String overview;
    @Column(name = "overview_gu", columnDefinition = "text")
    private String overviewGu;
    @Column(name = "benefits_note", columnDefinition = "text")
    private String benefitsNote;
    @Column(name = "benefits_note_gu", columnDefinition = "text")
    private String benefitsNoteGu;
    @Column(name = "eligibility_note", columnDefinition = "text")
    private String eligibilityNote;
    @Column(name = "eligibility_note_gu", columnDefinition = "text")
    private String eligibilityNoteGu;

    private String helplineLabel;
    private String helplineNumber;
    private String officialUrl;
    private LocalDate lastReviewedOn;
    private String contentSource = "DEMO_SEED";
    private String updatedBy;
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Version
    private Long version;

    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public List<SchemeContentDocumentItem> getDocumentsRequired() { return documentsRequired; }
    public void setDocumentsRequired(List<SchemeContentDocumentItem> documentsRequired) {
        this.documentsRequired = documentsRequired != null ? documentsRequired : new ArrayList<>();
    }
    public List<SchemeContentStepItem> getApplicationSteps() { return applicationSteps; }
    public void setApplicationSteps(List<SchemeContentStepItem> applicationSteps) {
        this.applicationSteps = applicationSteps != null ? applicationSteps : new ArrayList<>();
    }
    public List<SchemeContentFaqItem> getFaqs() { return faqs; }
    public void setFaqs(List<SchemeContentFaqItem> faqs) {
        this.faqs = faqs != null ? faqs : new ArrayList<>();
    }
    public String getOverview() { return overview; }
    public void setOverview(String v) { this.overview = v; }
    public String getOverviewGu() { return overviewGu; }
    public void setOverviewGu(String v) { this.overviewGu = v; }
    public String getBenefitsNote() { return benefitsNote; }
    public void setBenefitsNote(String v) { this.benefitsNote = v; }
    public String getBenefitsNoteGu() { return benefitsNoteGu; }
    public void setBenefitsNoteGu(String v) { this.benefitsNoteGu = v; }
    public String getEligibilityNote() { return eligibilityNote; }
    public void setEligibilityNote(String v) { this.eligibilityNote = v; }
    public String getEligibilityNoteGu() { return eligibilityNoteGu; }
    public void setEligibilityNoteGu(String v) { this.eligibilityNoteGu = v; }
    public String getHelplineLabel() { return helplineLabel; }
    public void setHelplineLabel(String helplineLabel) { this.helplineLabel = helplineLabel; }
    public String getHelplineNumber() { return helplineNumber; }
    public void setHelplineNumber(String helplineNumber) { this.helplineNumber = helplineNumber; }
    public String getOfficialUrl() { return officialUrl; }
    public void setOfficialUrl(String officialUrl) { this.officialUrl = officialUrl; }
    public LocalDate getLastReviewedOn() { return lastReviewedOn; }
    public void setLastReviewedOn(LocalDate lastReviewedOn) { this.lastReviewedOn = lastReviewedOn; }
    public String getContentSource() { return contentSource; }
    public void setContentSource(String contentSource) { this.contentSource = contentSource; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
}
