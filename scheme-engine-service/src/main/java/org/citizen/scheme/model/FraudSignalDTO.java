package org.citizen.scheme.model;

import java.time.LocalDateTime;

public record FraudSignalDTO(
    String signalType,
    String severity,
    String personName,
    String personId,
    String familyId,
    String schemeId,
    String schemeName,
    String detail,
    LocalDateTime detectedAt
) {}
