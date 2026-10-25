package org.citizen.family.model;

public record DocumentUploadRequest(
        String aadhaarRef,
        String docType,
        String fileName,
        String fileType,
        String fileData
) {}
