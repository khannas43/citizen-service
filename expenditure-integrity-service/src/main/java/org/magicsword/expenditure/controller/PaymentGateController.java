package org.magicsword.expenditure.controller;

import org.magicsword.expenditure.entity.PaymentBatch;
import org.magicsword.expenditure.service.PaymentGateService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The pre-payment gate. Who may upload and decide is set in OfficerSecurityConfig (officer.integrity.gate-roles). */
@RestController
@RequestMapping("/v1/payment-gate")
@CrossOrigin(originPatterns = "*")
public class PaymentGateController {

    private final PaymentGateService gate;

    public PaymentGateController(PaymentGateService gate) {
        this.gate = gate;
    }

    private static String operator(Jwt jwt) {
        if (jwt == null) return "unknown";
        return jwt.getClaimAsString("preferred_username") != null ? jwt.getClaimAsString("preferred_username") : jwt.getSubject();
    }

    @PostMapping("/screen")
    public ResponseEntity<Map<String, Object>> screen(@RequestParam("file") MultipartFile file,
                                                      @RequestParam(value = "name", required = false) String name,
                                                      @AuthenticationPrincipal Jwt jwt) throws Exception {
        String label = name != null && !name.isBlank() ? name : file.getOriginalFilename();
        PaymentBatch b = gate.screen(label, file.getInputStream(), operator(jwt));
        return ResponseEntity.ok(gate.getBatch(b.getId(), null, 0, 50));
    }

    @GetMapping("/batches")
    public List<Map<String, Object>> batches() {
        return gate.listBatches();
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        return gate.metrics();
    }

    @GetMapping("/batches/{id}")
    public Map<String, Object> batch(@PathVariable UUID id,
                                     @RequestParam(required = false) String verdict,
                                     @RequestParam(defaultValue = "0") int page,
                                     @RequestParam(defaultValue = "50") int size) {
        return gate.getBatch(id, verdict, page, size);
    }

    @PostMapping("/batches/{id}/lines/{lineId}/decision")
    public ResponseEntity<?> decide(@PathVariable UUID id, @PathVariable UUID lineId,
                                    @RequestBody Map<String, String> body, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(gate.decide(id, lineId, body.get("action"), body.get("reason"), operator(jwt)));
    }
}
