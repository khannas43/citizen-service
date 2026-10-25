package org.citizen.marriage.controller;

import org.citizen.marriage.model.ApplicationRequest;
import org.citizen.marriage.model.ApplicationResponse;
import org.citizen.marriage.model.ApplicationStatsResponse;
import org.citizen.marriage.service.MarriageCertificateService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/v1/applications")
@CrossOrigin(originPatterns = "*")
public class MarriageCertificateController {

    private final MarriageCertificateService service;

    public MarriageCertificateController(MarriageCertificateService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<ApplicationResponse>> listActive() {
        return ResponseEntity.ok(service.listActive());
    }

    @GetMapping(params = "aadhaar")
    public ResponseEntity<List<ApplicationResponse>> listByAadhaar(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.listByAadhaar(aadhaar));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApplicationStatsResponse> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    @PostMapping
    public ResponseEntity<ApplicationResponse> startApplication(@RequestBody ApplicationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startApplication(req));
    }

    @GetMapping("/track/{ref}")
    public ResponseEntity<Map<String, String>> trackByRef(@PathVariable String ref) {
        try {
            ApplicationResponse status = ref.matches("[A-Z]{2,3}-\\d{4}-\\d+")
                    ? service.getStatusByApplicationNo(ref)
                    : service.getStatus(MarriageCertificateService.extractId(ref));
            Map<String, String> body = new LinkedHashMap<>();
            body.put("applicationNo", status.applicationNo() != null ? status.applicationNo() : ref);
            body.put("engineRef", status.engineRef() != null ? status.engineRef() : "");
            body.put("status", status.status());
            body.put("currentTask", status.currentTask() != null ? status.currentTask() : "");
            return ResponseEntity.ok(body);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApplicationResponse> getStatus(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.getStatus(MarriageCertificateService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ApplicationResponse> approve(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.approve(MarriageCertificateService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
