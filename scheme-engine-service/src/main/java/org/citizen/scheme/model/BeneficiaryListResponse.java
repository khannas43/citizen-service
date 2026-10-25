package org.citizen.scheme.model;

import java.util.List;

public record BeneficiaryListResponse(
        List<BeneficiaryResponse> results,
        long totalMatched,
        int limit,
        int offset
) {}
