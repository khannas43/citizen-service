package org.magicsword.scheme.model;

import java.util.List;
import java.util.UUID;

public record BulkOverrideRequest(
        List<UUID> ids,
        String status,
        String reason,
        String officerName
) {}
