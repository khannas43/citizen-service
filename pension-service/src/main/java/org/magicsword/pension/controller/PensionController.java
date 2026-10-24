package org.magicsword.pension.controller;

import org.magicsword.pension.model.ApplicationStatsResponse;
import org.magicsword.pension.model.PensionRequest;
import org.magicsword.pension.model.PensionResponse;
import org.magicsword.pension.service.PensionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/v1/applications")
@CrossOrigin(originPatterns = "*")
public class PensionController {

    private final PensionService service;

    public PensionController(PensionService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<PensionResponse>> listActive() {
        return ResponseEntity.ok(service.listActive());
    }

    @GetMapping(params = "aadhaar")
    public ResponseEntity<List<PensionResponse>> listByAadhaar(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.listByAadhaar(aadhaar));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApplicationStatsResponse> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    @PostMapping
    public ResponseEntity<PensionResponse> startApplication(@RequestBody PensionRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startApplication(req));
    }

    @GetMapping("/track/{ref}")
    public ResponseEntity<Map<String, String>> trackByRef(@PathVariable String ref) {
        try {
            PensionResponse status = ref.matches("[A-Z]{2,3}-\\d{4}-\\d+")
                    ? service.getStatusByApplicationNo(ref)
                    : service.getStatus(PensionService.extractId(ref));
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
    public ResponseEntity<PensionResponse> getStatus(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.getStatus(PensionService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<PensionResponse> approve(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.approve(PensionService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
