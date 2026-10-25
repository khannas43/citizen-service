package org.citizen.grievance.controller;

import org.citizen.grievance.model.CitizenRespondRequest;
import org.citizen.grievance.model.ClarificationAnswerRequest;
import org.citizen.grievance.model.ClarificationRequest;
import org.citizen.grievance.model.ClarificationResponse;
import org.citizen.grievance.model.InfoRequestRequest;
import org.citizen.grievance.model.RespondByRefRequest;
import org.citizen.grievance.service.ClarificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/clarifications")
@CrossOrigin(
        allowedHeaders = "*",
        originPatterns = "*",
        methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PATCH, RequestMethod.OPTIONS}
)
public class ClarificationController {

    private final ClarificationService service;

    public ClarificationController(ClarificationService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<ClarificationResponse> ask(@RequestBody ClarificationRequest req) {
        return ResponseEntity.ok(service.ask(req));
    }

    @PostMapping("/info-request")
    public ResponseEntity<ClarificationResponse> infoRequest(@RequestBody InfoRequestRequest req) {
        return ResponseEntity.ok(service.createInfoRequest(req));
    }

    @GetMapping
    public ResponseEntity<List<ClarificationResponse>> list(
            @RequestParam(required = false) String aadhaar,
            @RequestParam(required = false) String applicationRef,
            @RequestParam(required = false) String direction) {
        if (applicationRef != null) {
            return ResponseEntity.ok(service.byApplication(applicationRef, direction));
        }
        if (aadhaar == null) {
            return ResponseEntity.ok(List.of());
        }
        return ResponseEntity.ok(service.byAadhaar(aadhaar, direction));
    }

    @GetMapping("/pending")
    public ResponseEntity<List<ClarificationResponse>> pending() {
        return ResponseEntity.ok(service.pendingCitizenQuestions());
    }

    @GetMapping("/info-requests/pending")
    public ResponseEntity<List<ClarificationResponse>> pendingInfoRequests(
            @RequestParam String aadhaar) {
        return ResponseEntity.ok(service.pendingInfoRequests(aadhaar));
    }

    @GetMapping("/citizen-responses")
    public ResponseEntity<List<ClarificationResponse>> citizenResponses() {
        return ResponseEntity.ok(service.citizenResponses());
    }

    @PatchMapping("/{id}/answer")
    public ResponseEntity<ClarificationResponse> answer(
            @PathVariable UUID id,
            @RequestBody ClarificationAnswerRequest req) {
        return ResponseEntity.ok(service.answer(id, req));
    }

    @PostMapping("/respond-by-ref")
    public ResponseEntity<ClarificationResponse> respondByRefPost(@RequestBody RespondByRefRequest req) {
        return ResponseEntity.ok(service.respondByRef(req));
    }

    @PatchMapping("/respond-by-ref")
    public ResponseEntity<ClarificationResponse> respondByRef(@RequestBody RespondByRefRequest req) {
        return ResponseEntity.ok(service.respondByRef(req));
    }

    @PatchMapping("/{id}/respond")
    public ResponseEntity<ClarificationResponse> respond(
            @PathVariable UUID id,
            @RequestBody CitizenRespondRequest req) {
        return ResponseEntity.ok(service.respond(id, req));
    }
}
