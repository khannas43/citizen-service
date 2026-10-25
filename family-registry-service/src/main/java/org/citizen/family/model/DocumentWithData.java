package org.citizen.family.model;

import java.time.LocalDateTime;
import java.util.UUID;

public record DocumentWithData(
        UUID id,
        String docType,
        String fileName,
        String fileType,
        String fileData,
        LocalDateTime uploadedAt
) {}
