package org.citizen.scheme.model;

import java.util.List;

public record CustomRuleRequest(
    String name,
    String description,
    String conditionLogic,
    List<RuleCondition> conditions,
    String createdBy
) {}
