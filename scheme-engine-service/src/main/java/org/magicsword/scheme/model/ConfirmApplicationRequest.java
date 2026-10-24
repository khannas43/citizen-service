package org.magicsword.scheme.model;

import java.util.UUID;

public record ConfirmApplicationRequest(
        UUID schemeId,
        String familyId,
        String aadhaarRef,
        String officerName,
        String applicationNo
) {}
