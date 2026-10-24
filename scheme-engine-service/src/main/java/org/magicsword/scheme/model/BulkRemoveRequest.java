package org.magicsword.scheme.model;

import java.util.List;
import java.util.UUID;

public record BulkRemoveRequest(
        List<UUID> ids,
        String reason
) {}
