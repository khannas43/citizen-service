package org.magicsword.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.entity.SchemeContent;
import org.magicsword.scheme.model.SchemeContentSaveRequest;
import org.magicsword.scheme.repository.SchemeBenefitComponentRepository;
import org.magicsword.scheme.repository.SchemeContentAuditRepository;
import org.magicsword.scheme.repository.SchemeContentRepository;
import org.magicsword.scheme.repository.SchemeRepository;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SchemeContentAdminServiceTest {

    private final UUID id = UUID.randomUUID();
    private SchemeContentRepository contentRepository;
    private SchemeContentAdminService service;
    private SchemeContent stored;
    private SchemeBenefitComponentRepository benefitComponentRepository;

    @BeforeEach
    void setUp() {
        SchemeRepository schemeRepository = mock(SchemeRepository.class);
        Scheme scheme = new Scheme();
        scheme.setId(id);
        scheme.setName("Widow Pension");
        scheme.setDescription("Monthly pension for widows");
        scheme.setBenefitType("MONTHLY");
        scheme.setBenefitValue("1250");
        scheme.setMinAge(18);
        scheme.setGender("F");
        scheme.setIsActive(true);
        when(schemeRepository.findById(id)).thenReturn(Optional.of(scheme));

        stored = new SchemeContent();
        stored.setSchemeId(id);
        stored.setVersion(3L);
        stored.setContentSource("DEMO_SEED");
        contentRepository = mock(SchemeContentRepository.class);
        when(contentRepository.findById(id)).thenReturn(Optional.of(stored));

        benefitComponentRepository = mock(SchemeBenefitComponentRepository.class);
        when(benefitComponentRepository.findBySchemeId(id)).thenReturn(List.of());
        service = new SchemeContentAdminService(
                schemeRepository, contentRepository, mock(SchemeContentAuditRepository.class),
                new SchemeContentValidationService(), benefitComponentRepository,
                new SchemeEligibilityCriteriaBuilder(new GuestEligibilityEvaluator(new RuleEvaluatorService())));
    }

    private static Jwt officerJwt() {
        return Jwt.withTokenValue("t").header("alg", "RS256")
                .claim("preferred_username", "scheme.dept")
                .claim("realm_access", Map.of("roles", List.of("SCHEME_DEPT")))
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
    }

    private SchemeContentSaveRequest request(Long version) {
        return new SchemeContentSaveRequest(version, List.of(), List.of(), List.of(), null, null, null);
    }

    @Test
    void saveReturnsTheVersionProducedByTheSaveNotTheOneSentIn() {
        // The database increments @Version when the row is flushed; the response must carry that new value,
        // otherwise the editor sends a stale version on its next save and conflicts with itself.
        when(contentRepository.saveAndFlush(any(SchemeContent.class))).thenAnswer(inv -> {
            SchemeContent c = inv.getArgument(0);
            c.setVersion(c.getVersion() + 1);
            return c;
        });

        SchemeContentAdminService.SaveResult result = service.save(id, request(3L), officerJwt());

        SchemeContentAdminService.SaveResult.Ok ok = assertInstanceOf(SchemeContentAdminService.SaveResult.Ok.class, result);
        assertEquals(4L, ok.body().version());
        assertEquals("OFFICER", ok.body().contentSource());
        verify(contentRepository).saveAndFlush(any(SchemeContent.class));
    }

    @Test
    void staleVersionIsAConflictAndNothingIsSaved() {
        SchemeContentAdminService.SaveResult result = service.save(id, request(2L), officerJwt());

        assertInstanceOf(SchemeContentAdminService.SaveResult.Conflict.class, result);
        verify(contentRepository, never()).saveAndFlush(any());
        verify(contentRepository, never()).save(any());
    }

    private SchemeContentSaveRequest withWording(Long version, String overview, String overviewGu, String benefits, String eligibility) {
        return new SchemeContentSaveRequest(version, List.of(), List.of(), List.of(), null, null, null,
                overview, overviewGu, benefits, null, eligibility, null);
    }

    @Test
    void editorLoadsReadOnlySchemeFactsForOverviewBenefitsAndEligibility() {
        var res = service.getForEditor(id).orElseThrow();

        assertEquals("Monthly pension for widows", res.scheme().description());
        assertEquals("MONTHLY", res.scheme().benefitType());
        assertEquals("1250", res.scheme().benefitValue());
        assertFalse(res.scheme().eligibility().isEmpty(), "criteria shown under Who can apply");
        assertTrue(res.scheme().eligibility().stream().anyMatch(c -> "age".equals(c.key())));
        assertNull(res.overview());
    }

    @Test
    void saveStoresTheOverviewBenefitAndEligibilityWording() {
        when(contentRepository.saveAndFlush(any(SchemeContent.class))).thenAnswer(inv -> inv.getArgument(0));

        var result = service.save(id, withWording(3L, "  A monthly pension for eligible widows.  ", "વિધવાઓ માટે માસિક પેન્શન",
                "Paid into the bank account each month.", "Widows of any age above 18."), officerJwt());

        var ok = assertInstanceOf(SchemeContentAdminService.SaveResult.Ok.class, result);
        assertEquals("A monthly pension for eligible widows.", ok.body().overview());
        assertEquals("વિધવાઓ માટે માસિક પેન્શન", ok.body().overviewGu());
        assertEquals("Paid into the bank account each month.", ok.body().benefitsNote());
        assertEquals("Widows of any age above 18.", ok.body().eligibilityNote());
        assertEquals("Monthly pension for widows", ok.body().scheme().description(), "scheme facts stay untouched");
    }

    @Test
    void htmlInTheNewSectionsIsRejected() {
        var result = service.save(id, withWording(3L, "<script>alert(1)</script>", null, null, "<b>bold</b>"), officerJwt());

        var v = assertInstanceOf(SchemeContentAdminService.SaveResult.Validation.class, result);
        assertTrue(v.fieldErrors().containsKey("overview"));
        assertTrue(v.fieldErrors().containsKey("eligibilityNote"));
        verify(contentRepository, never()).saveAndFlush(any());
    }

    @Test
    void overlongWordingIsRejected() {
        var result = service.save(id, withWording(3L, "x".repeat(2001), null, "y".repeat(1001), null), officerJwt());

        var v = assertInstanceOf(SchemeContentAdminService.SaveResult.Validation.class, result);
        assertTrue(v.fieldErrors().containsKey("overview"));
        assertTrue(v.fieldErrors().containsKey("benefitsNote"));
    }
}
