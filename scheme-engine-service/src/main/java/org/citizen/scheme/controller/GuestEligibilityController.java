package org.citizen.scheme.controller;

import org.citizen.scheme.model.GuestEligibilityRequest;
import org.citizen.scheme.model.GuestEligibilityResponse;
import org.citizen.scheme.service.SchemeEngineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/eligibility")
@CrossOrigin(originPatterns = "*")
public class GuestEligibilityController {

    private final SchemeEngineService service;

    public GuestEligibilityController(SchemeEngineService service) {
        this.service = service;
    }

    @PostMapping("/guest")
    public ResponseEntity<?> checkGuestEligibility(@RequestBody GuestEligibilityRequest req) {
        try {
            GuestEligibilityResponse body = service.checkGuestEligibility(req);
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
