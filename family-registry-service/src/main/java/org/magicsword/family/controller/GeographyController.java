package org.magicsword.family.controller;

import org.magicsword.family.service.FamilyRegistryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/geography")
@CrossOrigin(originPatterns = "*")
public class GeographyController {

    private final FamilyRegistryService service;

    public GeographyController(FamilyRegistryService service) {
        this.service = service;
    }

    @GetMapping("/talukas")
    public ResponseEntity<List<String>> listTalukas(@RequestParam String district) {
        if (district == null || district.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(service.listTalukasForDistrict(district.trim()));
    }

    @GetMapping("/villages")
    public ResponseEntity<List<String>> listVillages(
            @RequestParam String district,
            @RequestParam String taluka) {
        if (district == null || district.isBlank() || taluka == null || taluka.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(service.listVillagesForTaluka(district.trim(), taluka.trim()));
    }
}
