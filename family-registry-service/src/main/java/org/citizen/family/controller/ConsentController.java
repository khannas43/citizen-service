package org.citizen.family.controller;

import org.citizen.family.model.ConsentResponse;
import org.citizen.family.repository.ConsentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/persons/{aadhaarRef}/consents")
@CrossOrigin(allowedHeaders = "*", originPatterns = "*",
             methods = {RequestMethod.GET, RequestMethod.PATCH, RequestMethod.OPTIONS})
public class ConsentController {

    private final ConsentRepository repo;

    public ConsentController(ConsentRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public ResponseEntity<List<ConsentResponse>> list(@PathVariable String aadhaarRef) {
        List<ConsentResponse> result = repo.findByAadhaarRefOrderByGrantedAtDesc(aadhaarRef)
            .stream()
            .map(c -> new ConsentResponse(
                c.getId(), c.getDepartment(), c.getDataCategory(),
                c.getPurpose(), c.getStatus(), c.getGrantedAt(), c.getRevokedAt()
            ))
            .toList();
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/{id}/revoke")
    public ResponseEntity<ConsentResponse> revoke(
            @PathVariable String aadhaarRef,
            @PathVariable UUID id) {
        return repo.findById(id)
            .map(c -> {
                c.setStatus("REVOKED");
                c.setRevokedAt(LocalDateTime.now());
                var saved = repo.save(c);
                return ResponseEntity.ok(new ConsentResponse(
                    saved.getId(), saved.getDepartment(), saved.getDataCategory(),
                    saved.getPurpose(), saved.getStatus(), saved.getGrantedAt(),
                    saved.getRevokedAt()
                ));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/{id}/restore")
    public ResponseEntity<ConsentResponse> restore(
            @PathVariable String aadhaarRef,
            @PathVariable UUID id) {
        return repo.findById(id)
            .map(c -> {
                c.setStatus("ACTIVE");
                c.setRevokedAt(null);
                var saved = repo.save(c);
                return ResponseEntity.ok(new ConsentResponse(
                    saved.getId(), saved.getDepartment(), saved.getDataCategory(),
                    saved.getPurpose(), saved.getStatus(), saved.getGrantedAt(),
                    saved.getRevokedAt()
                ));
            })
            .orElse(ResponseEntity.notFound().build());
    }
}
