package org.citizen.family.controller;

import org.citizen.family.model.*;
import org.citizen.family.service.FamilyRegistryService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/families")
@CrossOrigin(originPatterns = "*")
public class FamilyController {

    private final FamilyRegistryService service;

    public FamilyController(FamilyRegistryService service) {
        this.service = service;
    }

    @GetMapping("/ids")
    public ResponseEntity<List<String>> listFamilyIds(
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "0") int limit) {
        if (limit <= 0) {
            return ResponseEntity.ok(service.listAllFamilyIds());
        }
        return ResponseEntity.ok(service.listFamilyIds(offset, limit));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Long>> stats() {
        return ResponseEntity.ok(service.stats());
    }

    @GetMapping("/{id}")
    public ResponseEntity<FamilyResponse> getFamily(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getFamily(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/income")
    public ResponseEntity<IncomeResponse> getFamilyIncome(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getFamilyIncome(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/scheme-eligibility")
    public ResponseEntity<List<SchemeEligibility>> getSchemeEligibility(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(service.getSchemeEligibility(id));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping
    public ResponseEntity<FamilyResponse> createFamily(@RequestBody CreateFamilyRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createFamily(req));
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<FamilyResponse> addMember(@PathVariable UUID id, @RequestBody AddMemberRequest req) {
        try {
            return ResponseEntity.ok(service.addMember(id, req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}/members/{personId}")
    public ResponseEntity<FamilyResponse> removeMember(@PathVariable UUID id, @PathVariable UUID personId) {
        try {
            return ResponseEntity.ok(service.removeMember(id, personId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
