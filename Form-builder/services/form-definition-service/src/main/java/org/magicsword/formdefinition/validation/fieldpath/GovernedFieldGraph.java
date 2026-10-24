package org.magicsword.formdefinition.validation.fieldpath;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Immutable governed field graph for one Form Definition. */
public final class GovernedFieldGraph {

    private final Map<String, GovernedField> byFieldId;
    private final List<GovernedField> ordered;

    public GovernedFieldGraph(List<GovernedField> ordered) {
        Map<String, GovernedField> map = new LinkedHashMap<>();
        for (GovernedField field : ordered) {
            map.put(field.fieldId(), field);
        }
        this.byFieldId = Collections.unmodifiableMap(map);
        this.ordered = List.copyOf(ordered);
    }

    public static GovernedFieldGraph empty() {
        return new GovernedFieldGraph(List.of());
    }

    public List<GovernedField> fields() {
        return ordered;
    }

    public Optional<GovernedField> find(String fieldId) {
        return Optional.ofNullable(byFieldId.get(fieldId));
    }

    public boolean contains(String fieldId) {
        return byFieldId.containsKey(fieldId);
    }

    public List<GovernedField> rootFields() {
        return ordered.stream().filter(f -> !f.isNested()).toList();
    }

    public int size() {
        return ordered.size();
    }
}
