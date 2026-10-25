package org.citizen.scheme.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.citizen.scheme.model.RuleCondition;

import java.util.List;

@Converter
public class RuleConditionConverter implements AttributeConverter<List<RuleCondition>, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(List<RuleCondition> conditions) {
        try {
            return conditions == null ? "[]" : MAPPER.writeValueAsString(conditions);
        } catch (Exception e) {
            return "[]";
        }
    }

    @Override
    public List<RuleCondition> convertToEntityAttribute(String json) {
        try {
            return json == null || json.isBlank()
                    ? List.of()
                    : MAPPER.readValue(json, new TypeReference<List<RuleCondition>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
