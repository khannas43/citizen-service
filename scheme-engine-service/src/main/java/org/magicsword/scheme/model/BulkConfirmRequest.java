package org.magicsword.scheme.model;

import java.util.List;
import java.util.UUID;

public record BulkConfirmRequest(
        List<UUID> ids,
        String officerName
) {}
