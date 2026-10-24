package org.magicsword.family.model;

public record DocumentUploadRequest(
        String aadhaarRef,
        String docType,
        String fileName,
        String fileType,
        String fileData
) {}
