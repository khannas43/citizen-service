package org.magicsword.family.repository;

import org.magicsword.family.entity.CitizenDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CitizenDocumentRepository extends JpaRepository<CitizenDocument, UUID> {
    List<CitizenDocument> findByAadhaarRefOrderByUploadedAtDesc(String aadhaarRef);

    Optional<CitizenDocument> findByAadhaarRefAndDocTypeAndTrustedSource(
            String aadhaarRef, String docType, String trustedSource);
}
