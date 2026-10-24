package org.magicsword.scheme.controller;

import org.magicsword.scheme.model.*;
import org.magicsword.scheme.service.SchemeEngineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/beneficiaries")
@CrossOrigin(originPatterns = "*")
public class BeneficiaryController {

    private final SchemeEngineService service;

    public BeneficiaryController(SchemeEngineService service) {
        this.service = service;
    }

    @GetMapping("/family/{familyId}")
    public ResponseEntity<List<BeneficiaryResponse>> getByFamily(@PathVariable String familyId) {
        return ResponseEntity.ok(service.getBeneficiariesByFamily(familyId));
    }

    @GetMapping("/dashboard/summary")
    public ResponseEntity<BeneficiaryDashboardSummary> getDashboardSummary() {
        return ResponseEntity.ok(service.getBeneficiaryDashboardSummary());
    }

    @GetMapping("/dashboard/recent")
    public ResponseEntity<BeneficiaryListResponse> getRecentBeneficiaries(
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka,
            @RequestParam(required = false) String village,
            @RequestParam(defaultValue = "false") boolean autoRemovalsOnly,
            @RequestParam(defaultValue = "recent") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(service.listBeneficiariesDashboard(
                schemeId, status, search, district, taluka, village,
                autoRemovalsOnly, sortBy, sortDir, offset, limit));
    }

    @GetMapping("/dashboard/geo-options")
    public ResponseEntity<BeneficiaryGeoOptions> getGeoOptions(
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka) {
        return ResponseEntity.ok(service.getBeneficiaryGeoOptions(schemeId, district, taluka));
    }

    @PostMapping("/bulk/confirm")
    public ResponseEntity<BulkActionResult> bulkConfirm(@RequestBody BulkConfirmRequest req) {
        try {
            return ResponseEntity.ok(service.bulkConfirmBeneficiaries(req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/bulk/remove")
    public ResponseEntity<BulkActionResult> bulkRemove(@RequestBody BulkRemoveRequest req) {
        try {
            return ResponseEntity.ok(service.bulkRemoveBeneficiaries(req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PatchMapping("/bulk/override")
    public ResponseEntity<BulkActionResult> bulkOverride(@RequestBody BulkOverrideRequest req) {
        try {
            return ResponseEntity.ok(service.bulkOverrideBeneficiaries(req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/confirm-application")
    public ResponseEntity<BeneficiaryResponse> confirmFromApprovedApplication(
            @RequestBody ConfirmApplicationRequest req) {
        try {
            return ResponseEntity.ok(service.confirmFromApprovedApplication(req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<BeneficiaryResponse> confirmBeneficiary(
            @PathVariable UUID id,
            @RequestBody(required = false) ConfirmBeneficiaryRequest req) {
        try {
            String officerName = req != null ? req.officerName() : null;
            return ResponseEntity.ok(service.confirmBeneficiary(id, officerName));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/remove")
    public ResponseEntity<BeneficiaryResponse> removeBeneficiary(
            @PathVariable UUID id,
            @RequestBody RemoveBeneficiaryRequest req) {
        try {
            return ResponseEntity.ok(service.removeBeneficiary(id, req.reason()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PatchMapping("/{id}/disburse")
    public ResponseEntity<BeneficiaryResponse> disburse(
            @PathVariable UUID id,
            @RequestBody DisburseRequest req) {
        try {
            return ResponseEntity.ok(service.disburse(id, req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PatchMapping("/{id}/override")
    public ResponseEntity<BeneficiaryResponse> override(
            @PathVariable UUID id,
            @RequestBody OverrideRequest req) {
        try {
            return ResponseEntity.ok(service.overrideBeneficiary(id, req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/{id}/audit")
    public ResponseEntity<List<AuditEvent>> getAudit(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getAuditTrail(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
