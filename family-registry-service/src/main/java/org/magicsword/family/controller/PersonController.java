package org.magicsword.family.controller;

import org.magicsword.family.model.PersonSearchCriteria;
import org.magicsword.family.model.PersonSearchResponse;
import org.magicsword.family.model.PersonSummary;
import org.magicsword.family.model.UpdateIncomeRequest;
import org.magicsword.family.repository.ConsentRepository;
import org.magicsword.family.repository.FamilyMemberRepository;
import org.magicsword.family.repository.FamilyRepository;
import org.magicsword.family.repository.PersonRepository;
import org.magicsword.family.service.FamilyRegistryService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/persons")
@CrossOrigin(originPatterns = "*")
public class PersonController {

    private final FamilyRegistryService service;
    private final PersonRepository personRepo;
    private final ConsentRepository consentRepo;
    private final FamilyMemberRepository familyMemberRepo;
    private final FamilyRepository familyRepo;

    public PersonController(FamilyRegistryService service,
                            PersonRepository personRepo,
                            ConsentRepository consentRepo,
                            FamilyMemberRepository familyMemberRepo,
                            FamilyRepository familyRepo) {
        this.service = service;
        this.personRepo = personRepo;
        this.consentRepo = consentRepo;
        this.familyMemberRepo = familyMemberRepo;
        this.familyRepo = familyRepo;
    }

    @GetMapping("/search")
    public ResponseEntity<PersonSearchResponse> searchPersons(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String aadhaar,
            @RequestParam(required = false) String mobile,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dob,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String occupation,
            @RequestParam(required = false) Long incomeMin,
            @RequestParam(required = false) Long incomeMax,
            @RequestParam(required = false) String casteCategory,
            @RequestParam(required = false) String educationLevel,
            @RequestParam(required = false) String maritalStatus,
            @RequestParam(required = false) String employmentStatus,
            @RequestParam(required = false) String relationship,
            @RequestParam(required = false) UUID familyId,
            @RequestParam(required = false) String address,
            @RequestParam(required = false) String village,
            @RequestParam(required = false) String taluka,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String state,
            @RequestParam(required = false, defaultValue = "50") int limit) {
        PersonSearchCriteria criteria = new PersonSearchCriteria(
                q, name, aadhaar, mobile, dob, gender, occupation,
                incomeMin, incomeMax, casteCategory, educationLevel, maritalStatus,
                employmentStatus, relationship, familyId, address, village, taluka,
                district, state, limit
        );
        return ResponseEntity.ok(service.searchPersons(criteria));
    }

    @GetMapping("/{aadhaarRef}/data-export")
    public ResponseEntity<Map<String, Object>> dataExport(@PathVariable String aadhaarRef) {
        var personOpt = personRepo.findByAadhaarRef(aadhaarRef);
        if (personOpt.isEmpty()) return ResponseEntity.notFound().build();
        var person = personOpt.get();

        var memberOpt = familyMemberRepo.findFirstByPersonId(person.getId());
        List<Map<String, Object>> familyMembers = List.of();
        Map<String, Object> familyInfo = Map.of();
        if (memberOpt.isPresent()) {
            UUID familyId = memberOpt.get().getFamilyId();
            familyRepo.findById(familyId).ifPresent(f -> {
                // captured via outer map below
            });
            var familyOpt = familyRepo.findById(familyId);
            if (familyOpt.isPresent()) {
                var f = familyOpt.get();
                familyInfo = Map.of(
                    "familyId", familyId.toString(),
                    "address", f.getAddress() != null ? f.getAddress() : "",
                    "village", f.getVillage() != null ? f.getVillage() : "",
                    "taluka", f.getTaluka() != null ? f.getTaluka() : "",
                    "district", f.getDistrict() != null ? f.getDistrict() : "",
                    "state", f.getState() != null ? f.getState() : ""
                );
            }
            familyMembers = familyMemberRepo.findByFamilyId(familyId).stream()
                .map(m -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("personId", m.getPersonId().toString());
                    row.put("relationship", m.getRelationshipToHead());
                    personRepo.findById(m.getPersonId()).ifPresent(p -> {
                        row.put("name", p.getName());
                        row.put("dob", p.getDob() != null ? p.getDob().toString() : null);
                        row.put("gender", p.getGender());
                        row.put("occupation", p.getOccupation());
                    });
                    return row;
                })
                .collect(Collectors.toList());
        }

        var consents = consentRepo.findByAadhaarRefOrderByGrantedAtDesc(aadhaarRef).stream()
            .map(c -> Map.<String, Object>of(
                "department", c.getDepartment(),
                "dataCategory", c.getDataCategory(),
                "purpose", c.getPurpose(),
                "status", c.getStatus(),
                "grantedAt", c.getGrantedAt() != null ? c.getGrantedAt().toString() : ""
            ))
            .collect(Collectors.toList());

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("exportedAt", LocalDateTime.now().toString());
        export.put("aadhaarRef", aadhaarRef);
        export.put("personalData", Map.of(
            "name", person.getName() != null ? person.getName() : "",
            "dob", person.getDob() != null ? person.getDob().toString() : "",
            "gender", person.getGender() != null ? person.getGender() : "",
            "mobile", person.getMobile() != null ? person.getMobile() : "",
            "casteCategory", person.getCasteCategory() != null ? person.getCasteCategory() : "",
            "annualIncome", person.getAnnualIncome() != null ? person.getAnnualIncome() : 0,
            "occupation", person.getOccupation() != null ? person.getOccupation() : ""
        ));
        export.put("familyInfo", familyInfo);
        export.put("familyMembers", familyMembers);
        export.put("consents", consents);
        return ResponseEntity.ok(export);
    }

    @PutMapping("/{id}/income")
    public ResponseEntity<PersonSummary> updateIncome(
            @PathVariable UUID id,
            @RequestBody UpdateIncomeRequest req) {
        try {
            return ResponseEntity.ok(service.updateIncome(id, req.annualIncome()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PatchMapping("/{id}/onboarding")
    public ResponseEntity<PersonSummary> completeOnboarding(
            @PathVariable UUID id,
            @RequestBody org.magicsword.family.model.CompleteOnboardingRequest req) {
        try {
            return ResponseEntity.ok(service.completeOnboarding(id, req));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
