package org.magicsword.scheme.entity;

import jakarta.persistence.*;
import org.magicsword.scheme.config.RuleConditionConverter;
import org.magicsword.scheme.model.RuleCondition;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "custom_rules")
public class CustomRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "condition_logic", length = 10)
    private String conditionLogic = "AND";

    @Convert(converter = RuleConditionConverter.class)
    @Column(name = "conditions_json", columnDefinition = "TEXT")
    private List<RuleCondition> conditions;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getConditionLogic() { return conditionLogic; }
    public void setConditionLogic(String conditionLogic) { this.conditionLogic = conditionLogic; }
    public List<RuleCondition> getConditions() { return conditions; }
    public void setConditions(List<RuleCondition> conditions) { this.conditions = conditions; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
