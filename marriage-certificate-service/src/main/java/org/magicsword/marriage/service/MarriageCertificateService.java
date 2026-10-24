package org.magicsword.marriage.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.magicsword.marriage.model.ApplicationRequest;
import org.magicsword.marriage.model.ApplicationResponse;
import org.magicsword.marriage.model.ApplicationStatsResponse;
import org.magicsword.marriage.repository.ApplicationRepository;
import org.magicsword.marriage.workflow.WorkflowClient;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MarriageCertificateService {

    private final ApplicationRepository repository;
    private final WorkflowClient workflowClient;
    private final AppNumberService appNumberService;

    public MarriageCertificateService(ApplicationRepository repository,
                                      WorkflowClient workflowClient,
                                      AppNumberService appNumberService) {
        this.repository = repository;
        this.workflowClient = workflowClient;
        this.appNumberService = appNumberService;
    }

    public ApplicationResponse startApplication(ApplicationRequest req) {
        String businessId = "MC-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        JsonNode response = workflowClient.apply(businessId);

        JsonNode errors = response.get("Errors");
        if (errors != null && errors.isArray() && !errors.isEmpty()) {
            throw new IllegalStateException(errors.get(0).path("message").asText("Workflow APPLY failed"));
        }

        JsonNode instances = response.get("ProcessInstances");
        if (instances == null || !instances.isArray() || instances.isEmpty()) {
            throw new IllegalStateException("Workflow APPLY returned no process instance");
        }

        String workflowId = instances.get(0).path("id").asText();
        String applicationNo = appNumberService.next("MAR");
        ApplicationResponse app = ApplicationResponse.started(
                workflowId,
                applicationNo,
                req.applicantName(),
                req.casteCode(),
                req.tenantId(),
                req.aadhaarRef()
        );
        repository.insert(app, businessId, workflowId);
        return app;
    }

    public ApplicationResponse getStatus(String engineRef) {
        return repository.findByEngineRef(normalizeEngineRef(engineRef))
                .orElseThrow(() -> new NoSuchElementException("No application found: " + engineRef));
    }

    public List<ApplicationResponse> listActive() {
        return repository.findPending();
    }

    public ApplicationResponse approve(String engineRef) {
        ApplicationRepository.ApplicationRecord record = repository.findRecordByEngineRef(normalizeEngineRef(engineRef))
                .orElseThrow(() -> new NoSuchElementException("No application found: " + engineRef));

        if (!"PENDING".equals(record.status())) {
            return getStatus(record.engineRef());
        }

        try {
            JsonNode response = workflowClient.approve(record.businessId());
            JsonNode errors = response.get("Errors");
            if (errors != null && errors.isArray() && !errors.isEmpty()) {
                repository.updateStatus(record.engineRef(), "APPROVED", null);
                return getStatus(record.engineRef());
            }
        } catch (RuntimeException ex) {
            repository.updateStatus(record.engineRef(), "APPROVED", null);
            return getStatus(record.engineRef());
        }

        repository.updateStatus(record.engineRef(), "APPROVED", null);
        return getStatus(record.engineRef());
    }

    public List<ApplicationResponse> listByAadhaar(String aadhaar) {
        return repository.findByAadhaarRef(aadhaar);
    }

    public ApplicationResponse getStatusByApplicationNo(String applicationNo) {
        return repository.findByApplicationNo(applicationNo)
                .orElseThrow(() -> new NoSuchElementException("No application found: " + applicationNo));
    }

    public static String extractId(String id) {
        if (id.startsWith("DGT-")) {
            return id.substring(4);
        }
        return id;
    }

    private String normalizeEngineRef(String id) {
        return id.startsWith("DGT-") ? id : "DGT-" + id;
    }

    public ApplicationStatsResponse getStats() {
        Map<String, Long> statusCounts = repository.countsByStatus();
        List<Long> turnaroundHours = repository.turnaroundHours();

        List<ApplicationStatsResponse.AssigneeBacklog> backlogByAssignee = repository.backlogByAssignee()
                .stream()
                .map(a -> new ApplicationStatsResponse.AssigneeBacklog(a.assignee(), a.pending()))
                .sorted(Comparator.comparingLong(ApplicationStatsResponse.AssigneeBacklog::pending).reversed())
                .collect(Collectors.toList());

        return new ApplicationStatsResponse(
                statusCounts,
                round2(average(turnaroundHours)),
                round2(median(turnaroundHours)),
                Collections.emptyList(),
                backlogByAssignee);
    }

    private static double average(List<Long> values) {
        return values.isEmpty() ? 0
                : values.stream().mapToLong(Long::longValue).average().orElse(0);
    }

    private static double median(List<Long> values) {
        if (values.isEmpty()) {
            return 0;
        }
        List<Long> sorted = new java.util.ArrayList<>(values);
        sorted.sort(Comparator.naturalOrder());
        int mid = sorted.size() / 2;
        return sorted.size() % 2 == 0
                ? (sorted.get(mid - 1) + sorted.get(mid)) / 2.0
                : sorted.get(mid);
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
