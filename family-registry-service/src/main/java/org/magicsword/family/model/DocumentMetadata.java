package org.magicsword.family.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record DocumentMetadata(
        UUID id,
        String docType,
        String fileName,
        String fileType,
        LocalDateTime uploadedAt,
        String trustedSource
) {}
