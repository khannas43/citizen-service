package org.magicsword.grievance.controller;

import org.magicsword.grievance.model.CommentRequest;
import org.magicsword.grievance.model.CommentResponse;
import org.magicsword.grievance.model.GrievanceRequest;
import org.magicsword.grievance.model.GrievanceResponse;
import org.magicsword.grievance.model.GrievanceThreadResponse;
import org.magicsword.grievance.model.GrievanceUpdateRequest;
import org.magicsword.grievance.service.GrievanceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/grievances")
@CrossOrigin(
        allowedHeaders = "*",
        originPatterns = "*",
        methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PATCH, RequestMethod.OPTIONS}
)
public class GrievanceController {

    private final GrievanceService service;

    public GrievanceController(GrievanceService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<GrievanceResponse> submit(@RequestBody GrievanceRequest req) {
        return ResponseEntity.ok(service.submit(req));
    }

    @GetMapping
    public ResponseEntity<List<GrievanceResponse>> getByCitizen(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.getCitizenGrievances(aadhaar));
    }

    @GetMapping("/all")
    public ResponseEntity<List<GrievanceResponse>> getAll() {
        return ResponseEntity.ok(service.getAllOpen());
    }

    @PatchMapping("/{id}")
    public ResponseEntity<GrievanceResponse> update(
            @PathVariable UUID id,
            @RequestBody GrievanceUpdateRequest req) {
        return ResponseEntity.ok(service.update(id, req));
    }

    @GetMapping("/{id}/thread")
    public ResponseEntity<GrievanceThreadResponse> thread(@PathVariable UUID id) {
        return ResponseEntity.ok(service.getThread(id));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<CommentResponse> addComment(
            @PathVariable UUID id,
            @RequestBody CommentRequest req) {
        return ResponseEntity.ok(service.addComment(id, req));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        return ResponseEntity.ok(service.stats());
    }
}
