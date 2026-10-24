package org.magicsword.schemeapp.controller;

import org.magicsword.schemeapp.model.ApplicationStatsResponse;
import org.magicsword.schemeapp.model.SchemeApplicationRequest;
import org.magicsword.schemeapp.model.SchemeApplicationResponse;
import org.magicsword.schemeapp.service.SchemeApplicationService;
import org.magicsword.schemeapp.util.AppRefNormalizer;
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
public class SchemeApplicationController {

    private final SchemeApplicationService service;

    public SchemeApplicationController(SchemeApplicationService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<SchemeApplicationResponse>> listActive() {
        return ResponseEntity.ok(service.listActive());
    }

    @GetMapping(params = "aadhaar")
    public ResponseEntity<List<SchemeApplicationResponse>> listByAadhaar(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.listByAadhaar(aadhaar));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApplicationStatsResponse> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    @PostMapping
    public ResponseEntity<SchemeApplicationResponse> startApplication(@RequestBody SchemeApplicationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startApplication(req));
    }

    @GetMapping("/track/{ref}")
    public ResponseEntity<Map<String, String>> trackByRef(@PathVariable String ref) {
        try {
            String normalized = AppRefNormalizer.normalize(ref);
            SchemeApplicationResponse status = normalized.matches("[A-Z]{2,3}-\\d{4}-\\d+")
                    ? service.getStatusByApplicationNo(normalized)
                    : service.getStatus(SchemeApplicationService.extractId(normalized));
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
    public ResponseEntity<SchemeApplicationResponse> getStatus(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.getStatus(SchemeApplicationService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<SchemeApplicationResponse> approve(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.approve(SchemeApplicationService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
