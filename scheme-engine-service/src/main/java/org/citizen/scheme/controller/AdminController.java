package org.citizen.scheme.controller;

import org.citizen.scheme.model.BirthdayCheckResult;
import org.citizen.scheme.model.FraudSignalDTO;
import org.citizen.scheme.model.IdentificationResult;
import org.citizen.scheme.model.OpsSummary;
import org.citizen.scheme.service.OfficeImportService;
import org.citizen.scheme.service.SchemeEngineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/admin")
@CrossOrigin(originPatterns = "*")
public class AdminController {

    private final SchemeEngineService service;
    private final OfficeImportService officeImportService;

    public AdminController(SchemeEngineService service, OfficeImportService officeImportService) {
        this.service = service;
        this.officeImportService = officeImportService;
    }

    @PostMapping("/run-identification")
    public ResponseEntity<IdentificationResult> runIdentification() {
        return ResponseEntity.ok(service.runIdentification());
    }

    @PostMapping("/backfill-geography")
    public ResponseEntity<Map<String, Object>> backfillGeography() {
        int count = service.backfillGeography();
        return ResponseEntity.ok(Map.of("updated", count));
    }

    /**
     * Legacy enrollment heuristics. Prefer {@code expenditure-integrity-service} alerts/cases for UC1 payment integrity.
     */
    @GetMapping("/fraud-signals")
    public ResponseEntity<List<FraudSignalDTO>> getFraudSignals() {
        return ResponseEntity.ok(service.getFraudSignals());
    }

    @GetMapping("/ops-summary")
    public ResponseEntity<OpsSummary> getOpsSummary() {
        return ResponseEntity.ok(service.getOpsSummary());
    }

    @PostMapping("/trigger-birthday-check")
    public ResponseEntity<BirthdayCheckResult> triggerBirthdayCheck(
            @RequestParam(required = false) String date) {
        LocalDate checkDate = date != null ? LocalDate.parse(date) : LocalDate.now();
        return ResponseEntity.ok(service.runBirthdayCheck(checkDate));
    }

    @PostMapping("/offices/import")
    public ResponseEntity<Map<String, Object>> importOffices(@RequestParam(value = "file", required = false) MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "CSV file required"));
        }
        return ResponseEntity.ok(officeImportService.importCsv(file));
    }
}
