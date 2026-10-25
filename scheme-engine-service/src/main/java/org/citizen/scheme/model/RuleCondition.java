package org.citizen.scheme.model;

public record RuleCondition(
    String field,    // income | age | caste | gender | district
    String operator, // <= | >= | = | != | IN | NOT_IN
    String value     // numeric for income/age; string for others; comma-separated for IN/NOT_IN
) {}
