package org.magicsword.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.repository.OfficeServiceLinkRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

class OfficeResolutionServiceTest {

    private OfficeServiceLinkRepository linkRepository;
    private OfficeResolutionService service;

    @BeforeEach
    void setUp() {
        linkRepository = mock(OfficeServiceLinkRepository.class);
        service = new OfficeResolutionService(linkRepository);
    }

    @Test
    void prefersSchemeLinkOverDepartment() {
        UUID schemeId = UUID.randomUUID();
        UUID officeId = UUID.randomUUID();
        Scheme scheme = new Scheme();
        scheme.setId(schemeId);
        scheme.setDepartment("Social Justice");
        scheme.setCategory("Pension");

        when(linkRepository.findOfficeIdsByServiceKeys(List.of(OfficeResolutionService.schemeKey(schemeId))))
                .thenReturn(List.of(officeId));

        Optional<Set<UUID>> ids = service.resolveOfficeIdsForScheme(scheme);
        assertTrue(ids.isPresent());
        assertEquals(Set.of(officeId), ids.get());
    }

    @Test
    void fallsBackToDepartmentWhenNoSchemeLink() {
        UUID schemeId = UUID.randomUUID();
        UUID officeId = UUID.randomUUID();
        Scheme scheme = new Scheme();
        scheme.setId(schemeId);
        scheme.setDepartment("Agriculture");
        scheme.setCategory("Agriculture");

        when(linkRepository.findOfficeIdsByServiceKeys(List.of(OfficeResolutionService.schemeKey(schemeId))))
                .thenReturn(List.of());
        when(linkRepository.findOfficeIdsByServiceKeys(List.of(OfficeResolutionService.deptKey("Agriculture"))))
                .thenReturn(List.of(officeId));

        Optional<Set<UUID>> ids = service.resolveOfficeIdsForScheme(scheme);
        assertEquals(Set.of(officeId), ids.orElseThrow());
    }
}
