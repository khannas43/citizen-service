package org.citizen.scheme.model;

public record BeneficiaryDashboardSummary(
        long active,
        long identified,
        long pendingConfirmation,
        long autoRemoved,
        long total
) {}
