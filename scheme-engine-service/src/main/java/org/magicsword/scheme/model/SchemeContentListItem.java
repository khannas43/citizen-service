package org.magicsword.scheme.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record SchemeContentListItem(
        UUID schemeId,
        String name,
        String department,
        String category,
        boolean hasContent,
        String contentSource,
        String updatedBy,
        LocalDateTime updatedAt
) {}
