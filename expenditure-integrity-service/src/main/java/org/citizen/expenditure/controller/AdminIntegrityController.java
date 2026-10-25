package org.citizen.expenditure.controller;

import org.citizen.expenditure.service.AcceptanceMetricsService;
import org.citizen.expenditure.service.DetectionEngineService;
import org.citizen.expenditure.service.ImportService;
import org.citizen.expenditure.service.LegacyFraudSignalsService;
import org.citizen.expenditure.service.PayrollImportService;
import org.citizen.expenditure.service.TalukaCoverageService;
import org.citizen.expenditure.service.ReadinessService;
import org.citizen.expenditure.service.WhatIfService;
import org.citizen.expenditure.repository.VerificationEventRepository;
import org.citizen.expenditure.service.DetectionSettings;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.citizen.expenditure.domain.IntegrityDomain;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin")
@CrossOrigin(originPatterns = "*")
public class AdminIntegrityController {

    private final DetectionEngineService detectionEngine;
    private final ImportService importService;
    private final PayrollImportService payrollImportService;
    private final AcceptanceMetricsService metricsService;
    private final LegacyFraudSignalsService legacyFraudSignalsService;
    private final TalukaCoverageService coverageService;
    private final WhatIfService whatIfService;
    private final ReadinessService readinessService;
    private final VerificationEventRepository verificationEventRepo;

    public AdminIntegrityController(
            DetectionEngineService detectionEngine,
            ImportService importService,
            PayrollImportService payrollImportService,
            AcceptanceMetricsService metricsService,
            LegacyFraudSignalsService legacyFraudSignalsService,
            TalukaCoverageService coverageService,
            WhatIfService whatIfService,
            ReadinessService readinessService,
            VerificationEventRepository verificationEventRepo) {
        this.detectionEngine = detectionEngine;
        this.importService = importService;
        this.payrollImportService = payrollImportService;
        this.metricsService = metricsService;
        this.legacyFraudSignalsService = legacyFraudSignalsService;
        this.coverageService = coverageService;
        this.whatIfService = whatIfService;
        this.readinessService = readinessService;
        this.verificationEventRepo = verificationEventRepo;
    }

    @PostMapping("/run-detection")
    public ResponseEntity<?> runDetection(@RequestBody RunDetectionBody body) {
        if (body.periodStart() != null && body.periodEnd() != null && body.periodStart().isAfter(body.periodEnd())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Pay period start must be on or before end."));
        }
        var result = detectionEngine.runDetection(new DetectionEngineService.DetectionRunRequest(
                body.schemeIds(), body.districts(), body.talukas(), body.periodStart(), body.periodEnd(),
                body.ddoCodes(), body.domains()));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/import/units")
    public ResponseEntity<?> importUnits(@RequestParam("file") MultipartFile file) throws Exception {
        var result = importService.importUnitsCsv(file.getInputStream());
        return ResponseEntity.ok(importAnswer(result));
    }

    @PostMapping("/import/settlements")
    public ResponseEntity<?> importSettlements(@RequestParam("file") MultipartFile file) throws Exception {
        var result = importService.importSettlementsCsv(file.getInputStream());
        return ResponseEntity.ok(importAnswer(result));
    }

    @PostMapping("/import/life-certificates")
    public ResponseEntity<?> importLifeCertificates(@RequestParam("file") MultipartFile file,
                                                    @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) throws Exception {
        String operator = jwt == null ? "unknown" : (jwt.getClaimAsString("preferred_username") != null ? jwt.getClaimAsString("preferred_username") : jwt.getSubject());
        var result = importService.importLifeCertificatesCsv(file.getInputStream(), operator);
        return ResponseEntity.ok(importAnswer(result));
    }

    @PostMapping("/import/verification-events")
    public ResponseEntity<?> importVerificationEvents(@RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(importAnswer(importService.importVerificationEventsCsv(file.getInputStream())));
    }

    @GetMapping("/import/verification-events/last")
    public ResponseEntity<Map<String, Object>> verificationEventsLastLoaded() {
        java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("lastLoadedAt", verificationEventRepo.findFirstByCreatedAtIsNotNullOrderByCreatedAtDesc()
                .map(org.citizen.expenditure.entity.VerificationEvent::getCreatedAt)
                .orElse(null));
        return ResponseEntity.ok(body);
    }

    @PostMapping("/import/employees")
    public ResponseEntity<?> importEmployees(@RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(importAnswer(payrollImportService.importEmployees(file.getInputStream())));
    }

    @PostMapping("/import/service-events")
    public ResponseEntity<?> importServiceEvents(@RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(importAnswer(payrollImportService.importServiceEvents(file.getInputStream())));
    }

    @PostMapping("/import/payroll")
    public ResponseEntity<?> importPayroll(@RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(importAnswer(payrollImportService.importPayroll(file.getInputStream())));
    }

    @PostMapping("/import/pensions")
    public ResponseEntity<?> importPensions(@RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(importAnswer(payrollImportService.importPensions(file.getInputStream())));
    }

    private static Map<String, Object> importAnswer(ImportService.ImportResult result) {
        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("imported", result.imported());
        out.put("skipped", result.skipped());
        out.put("updated", result.updated());
        if (result.newlyAtRisk() != null) {
            out.put("newlyAtRisk", result.newlyAtRisk());
        }
        return out;
    }

    /** A refused file is the uploader's to fix: say which line and why, and nothing was loaded. */
    @ExceptionHandler(org.citizen.expenditure.service.CsvImportException.class)
    public ResponseEntity<?> badCsv(org.citizen.expenditure.service.CsvImportException e) {
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage(), "line", e.getLine(), "imported", 0));
    }

    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> metrics(
            @RequestParam(required = false) org.citizen.expenditure.domain.IntegrityDomain domain) {
        return ResponseEntity.ok(metricsService.metrics(domain));
    }

    /** Deprecated path — use expenditure integrity alerts; proxies scheme-engine for transition. */
    @GetMapping("/fraud-signals")
    public ResponseEntity<List<Map<String, Object>>> fraudSignals(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return ResponseEntity.ok(legacyFraudSignalsService.fetchLegacySignals(authorization));
    }

    public record RunDetectionBody(
            List<UUID> schemeIds,
            List<String> districts,
            List<String> talukas,
            LocalDate periodStart,
            LocalDate periodEnd,
            List<String> ddoCodes,
            List<IntegrityDomain> domains) {}

    /** Counts loaded pilot rows per district/taluka (for demo QA — expect ≥20 units per taluka). */
    @GetMapping("/taluka-coverage")
    public ResponseEntity<List<Map<String, Object>>> talukaCoverage() {
        return ResponseEntity.ok(coverageService.talukaCoverage());
    }

    @GetMapping("/readiness")
    public ResponseEntity<Map<String, Object>> readiness() {
        return ResponseEntity.ok(readinessService.readiness());
    }

    @GetMapping("/what-if/defaults")
    public ResponseEntity<Map<String, Object>> whatIfDefaults() {
        return ResponseEntity.ok(whatIfService.defaults());
    }

    @PostMapping("/what-if")
    public ResponseEntity<WhatIfService.WhatIfResponse> whatIf(@RequestBody WhatIfBody body) {
        var req = new DetectionSettings.WhatIfRequest(
                body.rule804MinUnits(),
                body.rule805Threshold(),
                body.graceDaysDefault(),
                body.s06LifeCertificateDays(),
                body.s06BankChangeWindowDays());
        return ResponseEntity.ok(whatIfService.run(req));
    }

    public record WhatIfBody(
            Integer rule804MinUnits,
            Integer rule805Threshold,
            Integer graceDaysDefault,
            Integer s06LifeCertificateDays,
            Integer s06BankChangeWindowDays) {}
}
