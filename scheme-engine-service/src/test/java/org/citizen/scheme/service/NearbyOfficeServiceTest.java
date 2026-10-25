package org.citizen.scheme.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.scheme.entity.OfficeType;
import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.entity.ServiceOffice;
import org.citizen.scheme.model.NearbyOfficesResponse;
import org.citizen.scheme.repository.GeoCentroidRepository;
import org.citizen.scheme.repository.OfficeServiceLinkRepository;
import org.citizen.scheme.repository.SchemeRepository;
import org.citizen.scheme.repository.ServiceOfficeRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class NearbyOfficeServiceTest {

    private ServiceOfficeRepository officeRepository;
    private SchemeRepository schemeRepository;
    private OfficeServiceLinkRepository linkRepository;
    private OfficeResolutionService resolutionService;
    private NearbyOfficeService service;

    @BeforeEach
    void setUp() {
        officeRepository = mock(ServiceOfficeRepository.class);
        schemeRepository = mock(SchemeRepository.class);
        linkRepository = mock(OfficeServiceLinkRepository.class);
        when(linkRepository.findOfficeIdsByServiceKeys(anyList())).thenReturn(List.of());
        resolutionService = new OfficeResolutionService(linkRepository);
        service = new NearbyOfficeService(
                officeRepository, schemeRepository, resolutionService, mock(GeoCentroidRepository.class));
    }

    @Test
    void haversine_ordersByDistance() {
        double d1 = NearbyOfficeService.haversineKm(23.0225, 72.5714, 23.03, 72.58);
        double d2 = NearbyOfficeService.haversineKm(23.0225, 72.5714, 23.10, 72.70);
        assertTrue(d1 < d2);
    }

    @Test
    void districtSearchFallsBackToWholeDistrictWhenTalukaHasNoOffice() {
        ServiceOffice hq = office("Ahmedabad JSK", "Ahmedabad", 23.03, 72.58);
        when(officeRepository.filterByGeo(eq("Ahmedabad"), eq("Dholka"), isNull(), anyBoolean(), any(), anyBoolean(), any()))
                .thenReturn(List.of());
        when(officeRepository.filterByGeo(eq("Ahmedabad"), isNull(), isNull(), anyBoolean(), any(), anyBoolean(), any()))
                .thenReturn(List.of(hq));

        NearbyOfficesResponse res = service.findNearby(
                null, null, null, 25.0, "Ahmedabad", "Dholka", null, List.of(), 20);

        assertTrue(res.widened());
        assertEquals("Ahmedabad", res.widenedDistrict());
        assertEquals(1, res.offices().size());
    }

    @Test
    void districtSearchIsNotWidenedWhenTalukaHasOffices() {
        ServiceOffice local = office("Sanand JSK", "Ahmedabad", 22.99, 72.38);
        when(officeRepository.filterByGeo(eq("Ahmedabad"), eq("Sanand"), isNull(), anyBoolean(), any(), anyBoolean(), any()))
                .thenReturn(List.of(local));

        NearbyOfficesResponse res = service.findNearby(
                null, null, null, 25.0, "Ahmedabad", "Sanand", null, List.of(), 20);

        assertFalse(res.widened());
        assertEquals(1, res.offices().size());
    }

    @Test
    void villageIsPassedThroughAsAFilterThatOnlyNarrowsVillageSpecificOffices() {
        ServiceOffice taluka = office("Sanand JSK", "Ahmedabad", 22.99, 72.38);
        when(officeRepository.filterByGeo(eq("Ahmedabad"), eq("Sanand"), eq("Bol"), anyBoolean(), any(), anyBoolean(), any()))
                .thenReturn(List.of(taluka));

        NearbyOfficesResponse res = service.findNearby(
                null, null, null, 25.0, "Ahmedabad", "Sanand", "Bol", List.of(), 20);

        assertEquals(1, res.offices().size());
        verify(officeRepository).filterByGeo(eq("Ahmedabad"), eq("Sanand"), eq("Bol"), anyBoolean(), any(), anyBoolean(), any());
    }

    @Test
    void invalidLat_returns400ViaException() {
        assertThrows(IllegalArgumentException.class, () -> service.validateLatLng(19.0, 72.0));
        assertThrows(IllegalArgumentException.class, () -> service.validateLatLng(23.0, null));
    }

    @Test
    void widensWhenNothingInRadius() {
        ServiceOffice near = office("Near JSK", "Ahmedabad", 23.03, 72.58);
        ServiceOffice far = office("Far JSK", "Surat", 21.17, 72.83);
        when(officeRepository.findActiveForNearby(eq(true), eq(List.of()), eq(true), eq(List.of())))
                .thenReturn(List.of(near, far));

        NearbyOfficesResponse res = service.findNearby(
                null, 23.0225, 72.5714, 0.05, null, null, null, List.of(), 20);

        assertTrue(res.widened());
        assertEquals("Ahmedabad", res.widenedDistrict());
        assertFalse(res.offices().isEmpty());
    }

    @Test
    void schemeFilterEmpty_returnsNoOffices() {
        UUID schemeId = UUID.randomUUID();
        Scheme scheme = new Scheme();
        scheme.setId(schemeId);
        scheme.setIsActive(true);
        when(schemeRepository.findById(schemeId)).thenReturn(Optional.of(scheme));

        NearbyOfficesResponse res = service.findNearby(
                schemeId, null, null, 25, "Ahmedabad", null, null, List.of(), 20);
        assertTrue(res.offices().isEmpty());
    }

    private static ServiceOffice office(String name, String district, double lat, double lng) {
        ServiceOffice o = new ServiceOffice();
        o.setId(UUID.randomUUID());
        o.setName(name);
        o.setOfficeType(OfficeType.JAN_SEVA_KENDRA);
        o.setDistrict(district);
        o.setTaluka("Central");
        o.setAddress("Demo address");
        o.setLatitude(lat);
        o.setLongitude(lng);
        o.setIsActive(true);
        o.setDataSource("DEMO_SEED");
        return o;
    }
}
