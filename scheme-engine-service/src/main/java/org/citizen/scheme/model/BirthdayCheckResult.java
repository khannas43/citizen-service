package org.citizen.scheme.model;

public record BirthdayCheckResult(
        int personsTurning18,
        int newlyIdentified,
        int notificationsSent
) {}
