package org.magicsword.family.model;

import java.util.List;

public record PersonSearchResponse(
        List<PersonSummary> results,
        long totalMatched,
        boolean limited,
        int limit
) {
    public static PersonSearchResponse empty(int limit) {
        return new PersonSearchResponse(List.of(), 0, false, limit);
    }
}
