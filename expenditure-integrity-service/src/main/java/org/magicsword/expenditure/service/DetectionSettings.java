package org.magicsword.expenditure.service;

/** Tunable detection parameters (live values come from application.properties and scheme_grace_config). */
public record DetectionSettings(
        int defaultGraceDays,
        int bankClusterMin,
        int operatorChangeThreshold,
        String batchApprovalPrefix,
        int bankChangeWindowDays,
        int lifeCertificateMaxAgeDays) {

    public DetectionSettings withWhatIfOverrides(WhatIfRequest overrides) {
        return new DetectionSettings(
                overrides.graceDaysDefault() != null ? overrides.graceDaysDefault() : defaultGraceDays,
                overrides.rule804MinUnits() != null ? overrides.rule804MinUnits() : bankClusterMin,
                overrides.rule805Threshold() != null ? overrides.rule805Threshold() : operatorChangeThreshold,
                batchApprovalPrefix,
                overrides.s06BankChangeWindowDays() != null ? overrides.s06BankChangeWindowDays() : bankChangeWindowDays,
                overrides.s06LifeCertificateDays() != null ? overrides.s06LifeCertificateDays() : lifeCertificateMaxAgeDays);
    }

    /** POST /v1/admin/what-if body; omitted fields mean "as today". */
    public record WhatIfRequest(
            Integer rule804MinUnits,
            Integer rule805Threshold,
            Integer graceDaysDefault,
            Integer s06LifeCertificateDays,
            Integer s06BankChangeWindowDays) {}
}
