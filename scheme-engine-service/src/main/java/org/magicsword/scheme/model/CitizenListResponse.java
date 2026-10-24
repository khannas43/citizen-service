package org.magicsword.scheme.model;

import java.util.List;

public record CitizenListResponse(
        List<BeneficiaryResponse> results,
        long totalMatched,
        int limit,
        int offset
) {
    public static CitizenListResponse empty(int limit, int offset) {
        return new CitizenListResponse(List.of(), 0, limit, offset);
    }
}
