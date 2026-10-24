package org.magicsword.family.model;

import java.util.List;

public record TrustedDocumentSyncRequest(
        String aadhaarRef,
        List<String> services,
        String pensionType
) {}
