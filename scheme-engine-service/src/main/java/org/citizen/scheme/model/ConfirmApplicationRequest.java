package org.citizen.scheme.model;

import java.util.UUID;

public record ConfirmApplicationRequest(
        UUID schemeId,
        String familyId,
        String aadhaarRef,
        String officerName,
        String applicationNo
) {}
