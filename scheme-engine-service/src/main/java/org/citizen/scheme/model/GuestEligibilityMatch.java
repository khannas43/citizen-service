package org.citizen.scheme.model;

import java.util.List;
import java.util.UUID;

public record GuestEligibilityMatch(
        UUID schemeId,
        String schemeName,
        String schemeNameGujarati,
        String department,
        String category,
        // Legacy: true only when outcome is LIKELY_ELIGIBLE
        boolean eligible,
        GuestEligibilityOutcome outcome,
        List<String> missingFields,
        List<GuestReasonLine> reasons,
        /** Legacy string reasons — first guest reason text only, for older clients */
        List<String> reasonLines
) {}
