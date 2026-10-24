package org.magicsword.scheme.model;

import java.util.List;

public record ApplicationCheckResponse(
        String outcome,
        String schemeId,
        String schemeName,
        String summary,
        boolean blocked,
        List<ApplicationCheckItem> items
) {}
