package org.citizen.caste.controller;

import com.itextpdf.text.DocumentException;
import org.citizen.caste.model.ApplicationRequest;
import org.citizen.caste.model.ApplicationResponse;
import org.citizen.caste.model.ApplicationStatsResponse;
import org.citizen.caste.service.CasteCertificateService;
import org.citizen.caste.service.CertificatePdfService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/v1/applications")
@CrossOrigin(originPatterns = "*")
public class CasteCertificateController {

    private final CasteCertificateService service;
    private final CertificatePdfService pdfService;

    public CasteCertificateController(CasteCertificateService service,
                                      CertificatePdfService pdfService) {
        this.service = service;
        this.pdfService = pdfService;
    }

    @GetMapping
    public ResponseEntity<List<ApplicationResponse>> listActive() {
        return ResponseEntity.ok(service.listActive());
    }

    @GetMapping(params = "includeCompleted")
    public ResponseEntity<List<ApplicationResponse>> listAll(
            @RequestParam String includeCompleted) {
        return ResponseEntity.ok(service.listAll());
    }

    @GetMapping(params = "aadhaar")
    public ResponseEntity<List<ApplicationResponse>> listByAadhaar(@RequestParam String aadhaar) {
        return ResponseEntity.ok(service.listByAadhaar(aadhaar));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApplicationStatsResponse> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    @PostMapping
    public ResponseEntity<ApplicationResponse> startApplication(@RequestBody ApplicationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.startApplication(req));
    }

    @GetMapping("/track/{ref}")
    public ResponseEntity<Map<String, String>> trackByRef(@PathVariable String ref) {
        try {
            ApplicationResponse status = ref.matches("[A-Z]{2,3}-\\d{4}-\\d+")
                    ? service.getStatusByApplicationNo(ref)
                    : service.getStatus(CasteCertificateService.extractId(ref));
            Map<String, String> body = new LinkedHashMap<>();
            body.put("applicationNo", status.applicationNo() != null ? status.applicationNo() : ref);
            body.put("engineRef", status.engineRef() != null ? status.engineRef() : "");
            body.put("status", status.status());
            body.put("currentTask", status.currentTask() != null ? status.currentTask() : "");
            return ResponseEntity.ok(body);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApplicationResponse> getStatus(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.getStatus(CasteCertificateService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<ApplicationResponse> approve(@PathVariable String id) {
        try {
            return ResponseEntity.ok(service.approve(CasteCertificateService.extractId(id)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/certificate")
    public ResponseEntity<byte[]> downloadCertificate(@PathVariable String id) {
        try {
            String procId = CasteCertificateService.extractId(id);
            ApplicationResponse status = service.getStatus(procId);
            if (!"APPROVED".equals(status.status())) {
                return ResponseEntity.notFound().build();
            }
            String aadhaarRef;
            try {
                aadhaarRef = service.getAadhaarRef(procId);
            } catch (Exception e) {
                aadhaarRef = null;
            }
            byte[] pdf = pdfService.generate(status, aadhaarRef);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"certificate-" + status.engineRef() + ".pdf\"")
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(pdf);
        } catch (NoSuchElementException | DocumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
