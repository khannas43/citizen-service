package org.magicsword.auth.model;

import java.util.List;

public record PersonSearchResponse(
        List<PersonSummary> results,
        long totalMatched,
        boolean limited,
        int limit
) {}
