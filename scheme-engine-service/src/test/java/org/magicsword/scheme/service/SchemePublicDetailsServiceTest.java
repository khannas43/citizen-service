package org.magicsword.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.entity.SchemeContent;
import org.magicsword.scheme.model.SchemePublicDetailsResponse;
import org.magicsword.scheme.model.content.SchemeContentDocumentItem;
import org.magicsword.scheme.repository.SchemeBenefitComponentRepository;
import org.magicsword.scheme.repository.SchemeContentRepository;
import org.magicsword.scheme.repository.SchemeRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SchemePublicDetailsServiceTest {

    private SchemeRepository schemeRepository;
    private SchemeBenefitComponentRepository benefitComponentRepository;
    private SchemeContentRepository contentRepository;
    private SchemeEligibilityCriteriaBuilder criteriaBuilder;
    private SchemePublicDetailsService service;

    @BeforeEach
    void setUp() {
        schemeRepository = mock(SchemeRepository.class);
        benefitComponentRepository = mock(SchemeBenefitComponentRepository.class);
        contentRepository = mock(SchemeContentRepository.class);
        criteriaBuilder = new SchemeEligibilityCriteriaBuilder(
                new GuestEligibilityEvaluator(new RuleEvaluatorService()));
        service = new SchemePublicDetailsService(
                schemeRepository, benefitComponentRepository, contentRepository, criteriaBuilder);
    }

    @Test
    void includesContentAndSampleFlag() {
        UUID id = UUID.randomUUID();
        Scheme scheme = activeScheme(id);
        when(schemeRepository.findById(id)).thenReturn(Optional.of(scheme));
        when(benefitComponentRepository.findBySchemeId(id)).thenReturn(List.of());
        SchemeContent content = new SchemeContent();
        content.setSchemeId(id);
        content.setContentSource("DEMO_SEED");
        content.setDocumentsRequired(List.of(new SchemeContentDocumentItem("Aadhaar", "આધાર", null, null)));
        when(contentRepository.findById(id)).thenReturn(Optional.of(content));
        when(schemeRepository.findTop4ByIsActiveTrueAndCategoryIgnoreCaseAndIdNotOrderByNameAsc(any(), any()))
                .thenReturn(List.of());

        SchemePublicDetailsResponse res = service.getPublicDetails(id);
        assertTrue(res.contentIsSample());
        assertEquals(1, res.documentsRequired().size());
        assertFalse(res.relatedSchemes().stream().anyMatch(r -> r.id().equals(id)));
    }

    @Test
    void relatedSchemesExcludeSelf() {
        UUID id = UUID.randomUUID();
        Scheme scheme = activeScheme(id);
        scheme.setCategory("EDUCATION");
        Scheme other = activeScheme(UUID.randomUUID());
        other.setName("Other");
        when(schemeRepository.findTop4ByIsActiveTrueAndCategoryIgnoreCaseAndIdNotOrderByNameAsc("EDUCATION", id))
                .thenReturn(List.of(other, scheme));
        List<?> related = service.relatedSchemes(scheme);
        assertEquals(1, related.size());
    }

    @Test
    void officerOverviewReplacesTheSchemeDescriptionAndNotesAreExposed() {
        UUID id = UUID.randomUUID();
        Scheme scheme = activeScheme(id);
        scheme.setDescription("Original description");
        when(schemeRepository.findById(id)).thenReturn(Optional.of(scheme));
        when(benefitComponentRepository.findBySchemeId(id)).thenReturn(List.of());
        SchemeContent content = new SchemeContent();
        content.setSchemeId(id);
        content.setContentSource("OFFICER");
        content.setOverview("Officer overview");
        content.setOverviewGu("અધિકારી વિહંગાવલોકન");
        content.setBenefitsNote("Benefit note");
        content.setEligibilityNote("   ");
        when(contentRepository.findById(id)).thenReturn(Optional.of(content));

        SchemePublicDetailsResponse res = service.getPublicDetails(id);

        assertEquals("Officer overview", res.description());
        assertEquals("અધિકારી વિહંગાવલોકન", res.overviewGu());
        assertEquals("Benefit note", res.benefitsNote());
        assertNull(res.eligibilityNote(), "blank notes are not exposed");
        assertNull(res.benefitsNoteGu());
    }

    @Test
    void schemeDescriptionIsUsedWhenNoOfficerOverviewExists() {
        UUID id = UUID.randomUUID();
        Scheme scheme = activeScheme(id);
        scheme.setDescription("Original description");
        when(schemeRepository.findById(id)).thenReturn(Optional.of(scheme));
        when(benefitComponentRepository.findBySchemeId(id)).thenReturn(List.of());
        when(contentRepository.findById(id)).thenReturn(Optional.empty());

        SchemePublicDetailsResponse res = service.getPublicDetails(id);

        assertEquals("Original description", res.description());
        assertNull(res.overviewGu());
    }

    private static Scheme activeScheme(UUID id) {
        Scheme s = new Scheme();
        s.setId(id);
        s.setName("Test");
        s.setIsActive(true);
        s.setCategory("OTHER");
        s.setDepartment("Dept");
        return s;
    }
}
