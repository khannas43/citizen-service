package org.magicsword.scheme.controller;

import org.magicsword.scheme.model.*;
import org.magicsword.scheme.service.SchemeEngineService;
import org.magicsword.scheme.service.SchemePublicDetailsService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.TimeUnit;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/schemes")
@CrossOrigin(originPatterns = "*")
public class SchemeController {

    private final SchemeEngineService service;
    private final SchemePublicDetailsService publicDetailsService;

    public SchemeController(SchemeEngineService service, SchemePublicDetailsService publicDetailsService) {
        this.service = service;
        this.publicDetailsService = publicDetailsService;
    }

    @PostMapping
    public ResponseEntity<SchemeResponse> createScheme(@RequestBody SchemeRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createScheme(req));
    }

    @GetMapping
    public ResponseEntity<List<SchemeResponse>> listSchemes() {
        return ResponseEntity.ok(service.listSchemes());
    }

    @GetMapping("/coverage")
    public ResponseEntity<List<SchemeCoverageDTO>> getSchemeCoverage() {
        return ResponseEntity.ok(service.getSchemeCoverage());
    }

    @GetMapping("/{id}")
    public ResponseEntity<SchemeResponse> getScheme(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getScheme(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/public-details")
    public ResponseEntity<SchemePublicDetailsResponse> getPublicDetails(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic())
                    .body(publicDetailsService.getPublicDetails(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/application-check")
    public ResponseEntity<ApplicationCheckResponse> getApplicationCheck(
            @PathVariable UUID id,
            @RequestParam String familyId,
            @RequestParam(required = false) String aadhaar) {
        if (familyId == null || familyId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            return ResponseEntity.ok(service.getApplicationCheck(id, familyId.trim(), aadhaar));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<SchemeResponse> updateScheme(@PathVariable UUID id, @RequestBody SchemeRequest req) {
        try {
            return ResponseEntity.ok(service.updateScheme(id, req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<SchemeResponse> deactivateScheme(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.deactivateScheme(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/beneficiaries")
    public ResponseEntity<List<BeneficiaryResponse>> getBeneficiaries(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getBeneficiaries(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/status-counts")
    public ResponseEntity<SchemeStatusCountsDTO> getStatusCounts(
            @PathVariable UUID id,
            @RequestParam(required = false) String district) {
        try {
            return ResponseEntity.ok(service.getStatusCounts(id, district));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/geographic/districts")
    public ResponseEntity<GeographicLevelResponse> getGeographicDistricts(
            @PathVariable UUID id,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "15") int limit) {
        try {
            return ResponseEntity.ok(service.getGeographicDistricts(id, search, sortBy, sortDir, offset, limit));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/geographic/talukas")
    public ResponseEntity<GeographicLevelResponse> getGeographicTalukas(
            @PathVariable UUID id,
            @RequestParam String district,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "15") int limit) {
        try {
            return ResponseEntity.ok(service.getGeographicTalukas(id, district, search, sortBy, sortDir, offset, limit));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/geographic/villages")
    public ResponseEntity<GeographicLevelResponse> getGeographicVillages(
            @PathVariable UUID id,
            @RequestParam String district,
            @RequestParam String taluka,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int limit) {
        try {
            return ResponseEntity.ok(service.getGeographicVillages(id, district, taluka, search, sortBy, sortDir, offset, limit));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/geographic")
    public ResponseEntity<GeographicBreakdownDTO> getGeographicBreakdown(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getGeographicBreakdown(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/geographic/citizens")
    public ResponseEntity<List<GeographicBreakdownDTO.CitizenSummary>> getTalukaCitizens(
            @PathVariable UUID id,
            @RequestParam String district,
            @RequestParam String taluka,
            @RequestParam(defaultValue = "100") int limit) {
        try {
            return ResponseEntity.ok(service.getTalukaCitizens(id, district, taluka, limit));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/distribution")
    public ResponseEntity<SchemeDistributionDTO> getDistribution(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getSchemeDistribution(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/citizens")
    public ResponseEntity<CitizenListResponse> getCitizens(
            @PathVariable UUID id,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "100") int limit) {
        try {
            return ResponseEntity.ok(service.getCitizensForScheme(
                    id, district, taluka, search, offset, limit));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/simulate")
    public ResponseEntity<SimulateResponse> simulate(@RequestBody SimulateRequest req) {
        return ResponseEntity.ok(service.simulate(req));
    }
}
