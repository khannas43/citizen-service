package org.citizen.scheme.controller;

import org.citizen.scheme.entity.CustomRule;
import org.citizen.scheme.model.CustomRuleRequest;
import org.citizen.scheme.model.CustomRuleResponse;
import org.citizen.scheme.repository.CustomRuleRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/rules")
@CrossOrigin(originPatterns = "*")
public class CustomRuleController {

    private final CustomRuleRepository repo;

    public CustomRuleController(CustomRuleRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public List<CustomRuleResponse> listRules() {
        return repo.findAllByOrderByCreatedAtDesc().stream()
                .map(CustomRuleResponse::from)
                .toList();
    }

    @PostMapping
    public ResponseEntity<CustomRuleResponse> createRule(@RequestBody CustomRuleRequest req) {
        CustomRule rule = new CustomRule();
        rule.setName(req.name() != null && !req.name().isBlank() ? req.name() : "Untitled Rule");
        rule.setDescription(req.description());
        rule.setConditionLogic(req.conditionLogic() != null ? req.conditionLogic().toUpperCase() : "AND");
        rule.setConditions(req.conditions());
        rule.setCreatedBy(req.createdBy());
        rule.setCreatedAt(LocalDateTime.now());
        return ResponseEntity.status(HttpStatus.CREATED).body(CustomRuleResponse.from(repo.save(rule)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable UUID id) {
        if (!repo.existsById(id)) {
            throw new NoSuchElementException("Rule not found: " + id);
        }
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
