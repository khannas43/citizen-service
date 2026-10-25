package org.citizen.family.controller;

import org.citizen.family.entity.CitizenDocument;
import org.citizen.family.model.DocumentMetadata;
import org.citizen.family.model.DocumentUploadRequest;
import org.citizen.family.model.DocumentWithData;
import org.citizen.family.model.TrustedDocumentSyncRequest;
import org.citizen.family.repository.CitizenDocumentRepository;
import org.citizen.family.service.TrustedDocumentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/documents")
@CrossOrigin(originPatterns = "*")
public class DocumentController {

    private final CitizenDocumentRepository repo;
    private final TrustedDocumentService trustedDocumentService;

    public DocumentController(CitizenDocumentRepository repo, TrustedDocumentService trustedDocumentService) {
        this.repo = repo;
        this.trustedDocumentService = trustedDocumentService;
    }

    @GetMapping
    public List<DocumentMetadata> list(@RequestParam String aadhaar) {
        return repo.findByAadhaarRefOrderByUploadedAtDesc(aadhaar)
                .stream()
                .map(this::toMetadata)
                .toList();
    }

    /** Demo: simulate UIDAI eKYC + DigiLocker document pull for CAF Step 4 */
    @PostMapping("/sync-trusted")
    public List<DocumentMetadata> syncTrusted(@RequestBody TrustedDocumentSyncRequest req) {
        return trustedDocumentService.syncTrusted(req);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentMetadata upload(@RequestBody DocumentUploadRequest req) {
        CitizenDocument doc = new CitizenDocument();
        doc.setAadhaarRef(req.aadhaarRef());
        doc.setDocType(req.docType());
        doc.setFileName(req.fileName());
        doc.setFileType(req.fileType());
        doc.setFileData(req.fileData());
        doc.setUploadedAt(LocalDateTime.now());
        CitizenDocument saved = repo.save(doc);
        return toMetadata(saved);
    }

    @GetMapping("/{id}/data")
    public ResponseEntity<DocumentWithData> getData(@PathVariable UUID id) {
        return repo.findById(id)
                .map(d -> ResponseEntity.ok(new DocumentWithData(
                        d.getId(), d.getDocType(), d.getFileName(), d.getFileType(), d.getFileData(), d.getUploadedAt())))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @RequestParam String aadhaar) {
        repo.findById(id).ifPresent(d -> {
            if (d.getAadhaarRef().equals(aadhaar)) repo.delete(d);
        });
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
