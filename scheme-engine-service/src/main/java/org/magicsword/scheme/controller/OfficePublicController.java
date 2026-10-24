package org.magicsword.scheme.controller;

import org.magicsword.scheme.entity.OfficeType;
import org.magicsword.scheme.model.NearbyOfficesResponse;
import org.magicsword.scheme.model.OfficeFiltersResponse;
import org.magicsword.scheme.service.NearbyOfficeService;
import org.magicsword.scheme.service.OfficeFiltersService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/offices")
@CrossOrigin(originPatterns = "*")
public class OfficePublicController {

    private final NearbyOfficeService nearbyOfficeService;
    private final OfficeFiltersService filtersService;

    public OfficePublicController(NearbyOfficeService nearbyOfficeService, OfficeFiltersService filtersService) {
        this.nearbyOfficeService = nearbyOfficeService;
        this.filtersService = filtersService;
    }

    @GetMapping("/nearby")
    public ResponseEntity<NearbyOfficesResponse> nearby(
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(defaultValue = "25") double radiusKm,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka,
            @RequestParam(required = false) String village,
            @RequestParam(required = false) List<String> officeType,
            @RequestParam(defaultValue = "20") int limit) {
        try {
            if (radiusKm > 100) radiusKm = 100;
            if (limit > 50) limit = 50;
            List<OfficeType> types = parseTypes(officeType);
            NearbyOfficesResponse body = nearbyOfficeService.findNearby(
                    schemeId, lat, lng, radiusKm, district, taluka, village, types, limit);
            if (lat == null && lng == null) {
                return ResponseEntity.ok()
                        .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic())
                        .body(body);
            }
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/filters")
    public ResponseEntity<OfficeFiltersResponse> filters() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic())
                .body(filtersService.getFilters());
    }

    private static List<OfficeType> parseTypes(List<String> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        return raw.stream()
                .flatMap(s -> Arrays.stream(s.split(",")))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(OfficeType::valueOf)
                .collect(Collectors.toList());
    }
}
