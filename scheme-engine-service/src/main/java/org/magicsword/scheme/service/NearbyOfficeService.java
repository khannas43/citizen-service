package org.magicsword.scheme.service;

import org.magicsword.scheme.entity.GeoCentroid;
import org.magicsword.scheme.entity.OfficeType;
import org.magicsword.scheme.entity.Scheme;
import org.magicsword.scheme.entity.ServiceOffice;
import org.magicsword.scheme.model.NearbyOfficesResponse;
import org.magicsword.scheme.model.OfficeNearbyItem;
import org.magicsword.scheme.repository.GeoCentroidRepository;
import org.magicsword.scheme.repository.SchemeRepository;
import org.magicsword.scheme.repository.ServiceOfficeRepository;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class NearbyOfficeService {

    public static final double GUJ_LAT_MIN = 20.0;
    public static final double GUJ_LAT_MAX = 25.0;
    public static final double GUJ_LNG_MIN = 68.0;
    public static final double GUJ_LNG_MAX = 74.5;

    private final ServiceOfficeRepository officeRepository;
    private final SchemeRepository schemeRepository;
    private final OfficeResolutionService resolutionService;
    private final GeoCentroidRepository geoCentroidRepository;

    public NearbyOfficeService(
            ServiceOfficeRepository officeRepository,
            SchemeRepository schemeRepository,
            OfficeResolutionService resolutionService,
            GeoCentroidRepository geoCentroidRepository) {
        this.officeRepository = officeRepository;
        this.schemeRepository = schemeRepository;
        this.resolutionService = resolutionService;
        this.geoCentroidRepository = geoCentroidRepository;
    }

    public void validateLatLng(Double lat, Double lng) {
        if (lat == null && lng == null) return;
        if (lat == null || lng == null) {
            throw new IllegalArgumentException("Both lat and lng are required together");
        }
        if (lat < GUJ_LAT_MIN || lat > GUJ_LAT_MAX || lng < GUJ_LNG_MIN || lng > GUJ_LNG_MAX) {
            throw new IllegalArgumentException("Coordinates must be within Gujarat bounds");
        }
    }

    public NearbyOfficesResponse findNearby(
            UUID schemeId,
            Double lat,
            Double lng,
            double radiusKm,
            String district,
            String taluka,
            String village,
            List<OfficeType> officeTypes,
            int limit) {

        validateLatLng(lat, lng);
        Set<UUID> schemeFilter = resolveSchemeFilter(schemeId);
        if (schemeFilter != null && schemeFilter.isEmpty()) {
            return new NearbyOfficesResponse(List.of(), false, null, lat, lng, false);
        }
        boolean idsEmpty = schemeFilter == null;
        List<UUID> idList = idsEmpty ? List.of() : new ArrayList<>(schemeFilter);
        boolean typesEmpty = officeTypes == null || officeTypes.isEmpty();

        if (lat != null && lng != null) {
            return findByCoordinates(lat, lng, radiusKm, typesEmpty, officeTypes, idsEmpty, idList, limit);
        }
        return findByDistrict(district, taluka, village, typesEmpty, officeTypes, idsEmpty, idList, limit);
    }

    /** null = no scheme filter; empty set = scheme resolves to no offices. */
    private Set<UUID> resolveSchemeFilter(UUID schemeId) {
        if (schemeId == null) return null;
        Scheme scheme = schemeRepository.findById(schemeId).orElse(null);
        if (scheme == null || !Boolean.TRUE.equals(scheme.getIsActive())) {
            return Set.of();
        }
        return resolutionService.resolveOfficeIdsForScheme(scheme).orElse(Set.of());
    }

    private NearbyOfficesResponse findByCoordinates(
            double lat, double lng, double radiusKm,
            boolean typesEmpty, List<OfficeType> types,
            boolean idsEmpty, List<UUID> idList, int limit) {

        List<ServiceOffice> candidates = officeRepository.findActiveForNearby(typesEmpty, types, idsEmpty, idList);
        List<ScoredOffice> inRadius = new ArrayList<>();
        for (ServiceOffice o : candidates) {
            double d = haversineKm(lat, lng, o.getLatitude(), o.getLongitude());
            if (d <= radiusKm) {
                inRadius.add(new ScoredOffice(o, d));
            }
        }
        inRadius.sort(Comparator.comparingDouble(ScoredOffice::distanceKm));
        boolean widened = false;
        String widenedDistrict = null;

        if (inRadius.isEmpty() && !candidates.isEmpty()) {
            ScoredOffice nearest = candidates.stream()
                    .map(o -> new ScoredOffice(o, haversineKm(lat, lng, o.getLatitude(), o.getLongitude())))
                    .min(Comparator.comparingDouble(ScoredOffice::distanceKm))
                    .orElseThrow();
            widenedDistrict = nearest.office().getDistrict();
            final String widenDist = widenedDistrict;
            inRadius = candidates.stream()
                    .filter(o -> widenDist.equalsIgnoreCase(o.getDistrict()))
                    .map(o -> new ScoredOffice(o, haversineKm(lat, lng, o.getLatitude(), o.getLongitude())))
                    .sorted(Comparator.comparingDouble(ScoredOffice::distanceKm))
                    .limit(limit)
                    .collect(Collectors.toCollection(ArrayList::new));
            widened = true;
        } else {
            inRadius = inRadius.stream().limit(limit).collect(Collectors.toCollection(ArrayList::new));
        }

        List<OfficeNearbyItem> items = inRadius.stream().map(s -> toItem(s.office(), s.distanceKm())).toList();
        return new NearbyOfficesResponse(items, widened, widenedDistrict, lat, lng, hasDemoData(items));
    }

    private NearbyOfficesResponse findByDistrict(
            String district, String taluka, String village,
            boolean typesEmpty, List<OfficeType> types,
            boolean idsEmpty, List<UUID> idList, int limit) {

        if (district == null || district.isBlank()) {
            throw new IllegalArgumentException("district is required when lat/lng are not provided");
        }
        List<ServiceOffice> rows = officeRepository.filterByGeo(
                district.trim(), blankToNull(taluka), blankToNull(village),
                typesEmpty, types, idsEmpty, idList);
        // A taluka the office master does not list (the portal's other geography sources use different
        // taluka names) should still lead somewhere useful: fall back to the whole district and say so.
        boolean widened = false;
        if (rows.isEmpty() && blankToNull(taluka) != null) {
            rows = officeRepository.filterByGeo(
                    district.trim(), null, null, typesEmpty, types, idsEmpty, idList);
            widened = !rows.isEmpty();
        }
        List<OfficeNearbyItem> items = rows.stream()
                .limit(limit)
                .map(o -> toItem(o, null))
                .toList();

        GeoCentroid centroid = geoCentroidRepository.findById(district.trim()).orElse(null);
        Double cLat = centroid != null ? centroid.getLatitude() : null;
        Double cLng = centroid != null ? centroid.getLongitude() : null;
        if (cLat == null && !items.isEmpty()) {
            cLat = items.get(0).latitude();
            cLng = items.get(0).longitude();
        }
        return new NearbyOfficesResponse(items, widened, widened ? district.trim() : null, cLat, cLng, hasDemoData(items));
    }

    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private OfficeNearbyItem toItem(ServiceOffice o, Double distanceKm) {
        return new OfficeNearbyItem(
                o.getId(), o.getName(), o.getNameGujarati(), o.getOfficeType(), o.getDepartment(),
                o.getAddress(), o.getDistrict(), o.getTaluka(), o.getVillage(), o.getPincode(),
                o.getLatitude(), o.getLongitude(), o.getPhone(), o.getEmail(),
                o.getWorkingHours(), o.getWeeklyOff(), distanceKm,
                OfficeHoursParser.isOpenNow(o.getWorkingHours(), o.getWeeklyOff()),
                o.getDataSource());
    }

    private static boolean hasDemoData(List<OfficeNearbyItem> items) {
        return items.stream().anyMatch(i -> "DEMO_SEED".equals(i.dataSource()));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private record ScoredOffice(ServiceOffice office, double distanceKm) {}
}
