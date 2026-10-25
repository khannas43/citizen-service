package org.citizen.scheme.model;

import java.util.List;

public record BulkActionResult(
        int requested,
        int succeeded,
        int failed,
        int skipped,
        List<String> errors
) {}
