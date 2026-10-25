package org.citizen.scheme.service;

import org.junit.jupiter.api.Test;
import org.citizen.scheme.model.OfficeFiltersResponse;
import org.citizen.scheme.repository.ServiceOfficeRepository;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OfficeFiltersServiceTest {

    @Test
    void groupsVillagesByDistrictAndTaluka() {
        ServiceOfficeRepository repo = mock(ServiceOfficeRepository.class);
        when(repo.findDistinctDistricts()).thenReturn(List.of("Ahmedabad", "Surat"));
        when(repo.findDistinctTalukas("Ahmedabad")).thenReturn(List.of("Ahmedabad City", "Sanand"));
        when(repo.findDistinctTalukas("Surat")).thenReturn(List.of("Surat City"));
        when(repo.findDistinctVillages()).thenReturn(List.of(
                new Object[] {"Ahmedabad", "Sanand", "Bol"},
                new Object[] {"Ahmedabad", "Sanand", "Itola"},
                new Object[] {"Ahmedabad", "Ahmedabad City", "Navrangpura"},
                new Object[] {"Surat", "Surat City", "Adajan"}));

        OfficeFiltersResponse res = new OfficeFiltersService(repo).getFilters();

        assertEquals(List.of("Bol", "Itola"), res.villagesByTaluka().get("Ahmedabad").get("Sanand"));
        assertEquals(List.of("Navrangpura"), res.villagesByTaluka().get("Ahmedabad").get("Ahmedabad City"));
        assertEquals(List.of("Adajan"), res.villagesByTaluka().get("Surat").get("Surat City"));
    }

    @Test
    void talukaWithoutVillagesHasNoEntry() {
        ServiceOfficeRepository repo = mock(ServiceOfficeRepository.class);
        when(repo.findDistinctDistricts()).thenReturn(List.of("Dang"));
        when(repo.findDistinctTalukas("Dang")).thenReturn(List.of("Ahwa"));
        when(repo.findDistinctVillages()).thenReturn(List.of());

        OfficeFiltersResponse res = new OfficeFiltersService(repo).getFilters();

        assertTrue(res.villagesByTaluka().isEmpty());
        assertFalse(res.districts().isEmpty());
    }
}
