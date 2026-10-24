package org.magicsword.familymember.controller;

import org.magicsword.familymember.model.ApplicationStatsResponse;
import org.magicsword.familymember.model.FamilyMemberRequest;
import org.magicsword.familymember.model.FamilyMemberResponse;
import org.magicsword.familymember.service.FamilyMemberService;
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
public class FamilyMemberController {

    private final FamilyMemberService service;

    public FamilyMemberController(FamilyMemberService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<FamilyMemberResponse>> listActive() {
        return ResponseEntity.ok(service.listActive());
    }

    @GetMapping(params = "aadhaar")
    public ResponseEntity<List<FamilyMemberResponse>> listByAadhaar(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.listByAadhaar(aadhaar));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApplicationStatsResponse> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    @PostMapping
    public ResponseEntity<FamilyMemberResponse> startApplication(@RequestBody FamilyMemberRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startApplication(req));
    }

    @GetMapping("/track/{ref}")
    public ResponseEntity<Map<String, String>> trackByRef(@PathVariable String ref) {
        try {
            FamilyMemberResponse status = ref.matches("[A-Z]{2,3}-\\d{4}-\\d+")
                    ? service.getStatusByApplicationNo(ref)
                    : service.getStatus(FamilyMemberService.extractId(ref));
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
    public ResponseEntity<FamilyMemberResponse> getStatus(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.getStatus(FamilyMemberService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<FamilyMemberResponse> approve(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.approve(FamilyMemberService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
