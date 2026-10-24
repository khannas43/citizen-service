package org.magicsword.family.service;

import org.magicsword.family.entity.CitizenDocument;
import org.magicsword.family.model.DocumentMetadata;
import org.magicsword.family.model.TrustedDocumentSyncRequest;
import org.magicsword.family.repository.CitizenDocumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Demo simulation of UIDAI eKYC and DigiLocker document pull (no live API).
 */
@Service
public class TrustedDocumentService {

    /** Minimal valid PDF placeholder for demo attachments */
    private static final String DEMO_PDF_BASE64 =
            "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC" +
            "9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVka" +
            "WFCb3ggWzAgMCA2MTIgNzkyXS9Db250ZW50cyA0IDAgUj4+CmVuZG9iCjQgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj5z" +
            "dHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKERpZ2l0YWwgR3VqYXJhdCBEZW1vKSBUagpFVAplbmRzdHJl" +
            "YW0KZW5kb2JqCnJvb3QgMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKZW5kb2Jq" +
            "CnRyb2xsZXIKPDwKL1NpemUgNS9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0MjMKJSVFT0YK";

    private final CitizenDocumentRepository repo;

    public TrustedDocumentService(CitizenDocumentRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public List<DocumentMetadata> syncTrusted(TrustedDocumentSyncRequest req) {
        String aadhaar = req.aadhaarRef();
        List<String> services = req.services() != null ? req.services() : List.of();

        ensureTrustedDoc(aadhaar, "Aadhar", "UIDAI", null);
        ensureTrustedDoc(aadhaar, "Income Certificate", "DigiLocker", null);

        if (services.contains("pension") && "WIDOW".equalsIgnoreCase(req.pensionType())) {
            ensureTrustedDoc(aadhaar, "Death Certificate (Spouse)", "DigiLocker", "death-certificate-spouse.pdf");
        }

        removeLegacyDummyDocs(aadhaar);

        return repo.findByAadhaarRefOrderByUploadedAtDesc(aadhaar).stream()
                .map(this::toMetadata)
                .toList();
    }

    private void removeLegacyDummyDocs(String aadhaarRef) {
        for (CitizenDocument d : repo.findByAadhaarRefOrderByUploadedAtDesc(aadhaarRef)) {
            // Citizen uploads must keep their filename and stay in the manual vault.
            if (d.getTrustedSource() == null || d.getTrustedSource().isBlank()) {
                continue;
            }
            String fileName = d.getFileName() != null ? d.getFileName().toLowerCase() : "";
            boolean incomeDummy = "income-certificate.pdf".equals(fileName);
            boolean legacyAadhaarFile = "aadhaar-ekyc.pdf".equals(fileName)
                    || "aadhar-ekyc.pdf".equals(fileName);
            if (incomeDummy || "Income Certificate".equals(d.getDocType())) {
                d.setDocType("Income Certificate");
                d.setFileName(null);
                repo.save(d);
                continue;
            }
            if ("Aadhaar Card".equals(d.getDocType()) || "Aadhaar".equals(d.getDocType()) || legacyAadhaarFile) {
                d.setDocType("Aadhar");
                d.setFileName(null);
                repo.save(d);
            }
        }
    }

    private void ensureTrustedDoc(String aadhaarRef, String docType, String trustedSource, String fileName) {
        if (repo.findByAadhaarRefAndDocTypeAndTrustedSource(aadhaarRef, docType, trustedSource).isPresent()) {
            return;
        }
        CitizenDocument doc = new CitizenDocument();
        doc.setAadhaarRef(aadhaarRef);
        doc.setDocType(docType);
        doc.setTrustedSource(trustedSource);
        doc.setFileName(fileName);
        doc.setFileType("application/pdf");
        doc.setFileData(DEMO_PDF_BASE64);
        doc.setUploadedAt(LocalDateTime.now());
        repo.save(doc);
    }

    private DocumentMetadata toMetadata(CitizenDocument d) {
        return new DocumentMetadata(
                d.getId(),
                d.getDocType(),
                d.getFileName(),
                d.getFileType(),
                d.getUploadedAt(),
                d.getTrustedSource()
        );
    }
}
