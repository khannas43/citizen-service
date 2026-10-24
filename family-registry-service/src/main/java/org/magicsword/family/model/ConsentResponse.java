package org.magicsword.family.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record ConsentResponse(
    UUID id,
    String department,
    String dataCategory,
    String purpose,
    String status,
    LocalDateTime grantedAt,
    LocalDateTime revokedAt
) {}
