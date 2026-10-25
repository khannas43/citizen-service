package org.citizen.scheme.model;

import java.util.List;

public record SimulateRequest(
    String baseSchemeId,
    SimulateParameters parameters,
    String ruleId,
    List<RuleCondition> conditions,
    String conditionLogic
) {}
