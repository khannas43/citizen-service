package org.magicsword.scheme.model;

import org.magicsword.scheme.entity.CustomRule;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record CustomRuleResponse(
    UUID id,
    String name,
    String description,
    String conditionLogic,
    List<RuleCondition> conditions,
    String createdBy,
    LocalDateTime createdAt
) {
    public static CustomRuleResponse from(CustomRule r) {
        return new CustomRuleResponse(
                r.getId(), r.getName(), r.getDescription(),
                r.getConditionLogic(), r.getConditions(),
                r.getCreatedBy(), r.getCreatedAt()
        );
    }
}
