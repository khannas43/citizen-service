package org.citizen.scheme.model;

import java.time.LocalDateTime;

public record AuditEvent(
        LocalDateTime timestamp,
        String action,
        String actor,
        String detail
) {}
