package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * A per-course-category benefit breakdown for schemes whose assistance amount
 * varies by course (e.g. MYSY: tuition/boarding/books differ for Medical vs Diploma).
 * A Scheme with no rows here uses its single flat benefitValue as today.
 */
@Entity
@Table(name = "scheme_benefit_component")
public class SchemeBenefitComponent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID schemeId;
    private String courseCategory; // MEDICAL_DENTAL|ENGINEERING_GROUP|DIPLOMA|ARTS_COMMERCE
    private Long tuitionAmount;
    private Long boardingAmount;
    private Long booksAmount;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSchemeId() { return schemeId; }
    public void setSchemeId(UUID schemeId) { this.schemeId = schemeId; }
    public String getCourseCategory() { return courseCategory; }
    public void setCourseCategory(String courseCategory) { this.courseCategory = courseCategory; }
    public Long getTuitionAmount() { return tuitionAmount; }
    public void setTuitionAmount(Long tuitionAmount) { this.tuitionAmount = tuitionAmount; }
    public Long getBoardingAmount() { return boardingAmount; }
    public void setBoardingAmount(Long boardingAmount) { this.boardingAmount = boardingAmount; }
    public Long getBooksAmount() { return booksAmount; }
    public void setBooksAmount(Long booksAmount) { this.booksAmount = booksAmount; }
}
