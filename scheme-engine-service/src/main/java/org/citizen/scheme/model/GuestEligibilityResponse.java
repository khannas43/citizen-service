package org.citizen.scheme.model;

import java.util.List;

public record GuestEligibilityResponse(
        int schemesChecked,
        /** Likely eligible count (same as legacy eligibleCount). */
        int eligibleCount,
        int likelyCount,
        int possibleCount,
        int notEligibleCount,
        List<GuestEligibilityMatch> matches,
        String disclaimer
) {}
