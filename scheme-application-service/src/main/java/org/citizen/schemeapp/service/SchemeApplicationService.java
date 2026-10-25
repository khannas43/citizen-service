package org.citizen.schemeapp.service;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.citizen.schemeapp.model.ApplicationStatsResponse;
import org.citizen.schemeapp.model.SchemeApplicationRequest;
import org.citizen.schemeapp.model.SchemeApplicationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class SchemeApplicationService {

    private static final Logger log = LoggerFactory.getLogger(SchemeApplicationService.class);
    private static final String NOTIFICATIONS_URL =
            "http://notifications-service.citizen.svc.cluster.local:8080/notifications-service/v1/notifications";

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;
    private final WebClient webClient;
    private final RestTemplate restTemplate;
    private final String familyRegistryBaseUrl;
    private final String schemeEngineBaseUrl;
    /** Shared key that lets this service call the scheme-engine endpoints that mark a beneficiary as availing. */
    private final String internalServiceKey;
    private final AppNumberService appNumberService;

    public SchemeApplicationService(RuntimeService runtimeService,
                                    TaskService taskService,
                                    HistoryService historyService,
                                    WebClient.Builder webClientBuilder,
                                    RestTemplate restTemplate,
                                    @Value("${family.registry.base-url}") String familyRegistryBaseUrl,
                                    @Value("${scheme.engine.base-url}") String schemeEngineBaseUrl,
                                    @Value("${internal.service-key:}") String internalServiceKey,
                                    AppNumberService appNumberService) {
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.historyService = historyService;
        this.webClient = webClientBuilder.build();
        this.restTemplate = restTemplate;
        this.familyRegistryBaseUrl = familyRegistryBaseUrl;
        this.schemeEngineBaseUrl = schemeEngineBaseUrl;
        this.internalServiceKey = internalServiceKey;
        this.appNumberService = appNumberService;
    }

    public SchemeApplicationResponse startApplication(SchemeApplicationRequest req) {
        if (req.aadhaarRef() != null && !req.aadhaarRef().isBlank() && req.schemeId() != null) {
            findBlockingApplication(req.aadhaarRef(), req.schemeId()).ifPresent(this::throwDuplicateConflict);
        }
        Long registryIncome = null;
        String eligibilityNotes = null;

        try {
            Map<String, Object> income = webClient.get()
                    .uri(familyRegistryBaseUrl + "/v1/families/{id}/income", req.familyId())
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();
            if (income != null && income.get("totalAnnualIncome") != null) {
                registryIncome = ((Number) income.get("totalAnnualIncome")).longValue();
            }
        } catch (Exception ex) {
            log.warn("Failed to fetch registry income for {}: {}", req.familyId(), ex.getMessage());
        }

        try {
            List<Map<String, Object>> eligibility = webClient.get()
                    .uri(familyRegistryBaseUrl + "/v1/families/{id}/scheme-eligibility", req.familyId())
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<Map<String, Object>>>() {})
                    .block();
            if (eligibility != null && req.schemeName() != null) {
                eligibilityNotes = eligibility.stream()
                        .filter(entry -> schemeMatches(entry, req.schemeName(), req.schemeId()))
                        .map(entry -> String.valueOf(entry.get("reason")))
                        .findFirst()
                        .orElse(null);
            }
        } catch (Exception ex) {
            log.warn("Failed to fetch scheme eligibility for {}: {}", req.familyId(), ex.getMessage());
        }

        Map<String, Object> vars = new HashMap<>();
        String applicationNo = appNumberService.next("SCH");
        vars.put("applicationNo", applicationNo);
        vars.put("schemeId", req.schemeId());
        vars.put("schemeName", req.schemeName());
        vars.put("familyId", req.familyId());
        vars.put("aadhaarRef", req.aadhaarRef());
        vars.put("declaredIncome", req.declaredIncome());
        vars.put("registryIncome", registryIncome != null ? registryIncome : -1L);
        vars.put("eligibilityNotes", eligibilityNotes != null ? eligibilityNotes : "N/A");
        vars.put("tenantId", req.tenantId());
        vars.put("assignee", "income-officer");

        var instance = runtimeService.startProcessInstanceByKey("schemeApplication", vars);
        return SchemeApplicationResponse.started(
                instance.getId(),
                applicationNo,
                req.aadhaarRef(),
                req.schemeId(),
                req.schemeName(),
                req.familyId(),
                req.declaredIncome(),
                registryIncome,
                eligibilityNotes
        );
    }

    public SchemeApplicationResponse getStatus(String processInstanceId) {
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (!activeTasks.isEmpty()) {
            Task task = activeTasks.get(0);
            Map<String, Object> vars = runtimeService.getVariables(processInstanceId);
            return toResponse(processInstanceId, "PENDING", task, vars);
        }

        HistoricProcessInstance historic = historyService.createHistoricProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        if (historic == null) {
            throw new NoSuchElementException("No process instance found: " + processInstanceId);
        }

        Map<String, Object> vars = new HashMap<>();
        historyService.createHistoricVariableInstanceQuery()
                .processInstanceId(processInstanceId)
                .list()
                .forEach(hv -> {
                    if (hv.getValue() != null) {
                        vars.put(hv.getVariableName(), hv.getValue());
                    }
                });

        boolean escalated = historic.getEndActivityId() != null
                && historic.getEndActivityId().toLowerCase().contains("escalation");
        String status = escalated ? "ESCALATED" : "APPROVED";
        return toResponse(processInstanceId, status, null, vars);
    }

    public List<SchemeApplicationResponse> listActive() {
        return taskService.createTaskQuery()
                .active()
                .orderByTaskCreateTime().asc()
                .list()
                .stream()
                .map(task -> {
                    Map<String, Object> vars = runtimeService.getVariables(task.getProcessInstanceId());
                    return toResponse(task.getProcessInstanceId(), "PENDING", task, vars);
                })
                .collect(Collectors.toList());
    }

    public List<SchemeApplicationResponse> listByAadhaar(String aadhaar) {
        // Active (pending) tasks
        List<SchemeApplicationResponse> active = taskService.createTaskQuery()
                .processVariableValueEquals("aadhaarRef", aadhaar)
                .active()
                .list()
                .stream()
                .map(task -> {
                    Map<String, Object> vars = runtimeService.getVariables(task.getProcessInstanceId());
                    return toResponse(task.getProcessInstanceId(), "PENDING", task, vars);
                })
                .collect(Collectors.toList());

        // Completed / approved historic processes
        List<SchemeApplicationResponse> finished = historyService.createHistoricProcessInstanceQuery()
                .variableValueEquals("aadhaarRef", aadhaar)
                .finished()
                .list()
                .stream()
                .map(historic -> getStatus(historic.getId()))
                .collect(Collectors.toList());

        List<SchemeApplicationResponse> result = new java.util.ArrayList<>(active);
        result.addAll(finished);
        return result;
    }

    private Optional<SchemeApplicationResponse> findBlockingApplication(String aadhaarRef, String schemeId) {
        return listByAadhaar(aadhaarRef).stream()
                .filter(app -> schemeId.equals(app.schemeId()) && isBlockingStatus(app.status()))
                .findFirst();
    }

    private static boolean isBlockingStatus(String status) {
        return "PENDING".equals(status) || "APPROVED".equals(status);
    }

    private void throwDuplicateConflict(SchemeApplicationResponse existing) {
        String ref = existing.applicationNo() != null && !existing.applicationNo().isBlank()
                ? existing.applicationNo()
                : existing.engineRef();
        String message = "APPROVED".equals(existing.status())
                ? "Scheme application already approved: " + ref
                : "Scheme application already in progress: " + ref;
        throw new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public SchemeApplicationResponse approve(String processInstanceId) {
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (activeTasks.isEmpty()) {
            return getStatus(processInstanceId);
        }

        Task task = activeTasks.get(0);
        Map<String, Object> vars = runtimeService.getVariables(processInstanceId);
        String aadhaarRef = (String) vars.getOrDefault("aadhaarRef", null);
        String familyId = stringVar(vars, "familyId");
        String schemeId = stringVar(vars, "schemeId");
        String applicationNo = stringVar(vars, "applicationNo");

        taskService.complete(task.getId());
        SchemeApplicationResponse status = getStatus(processInstanceId);

        if ("APPROVED".equals(status.status()) && aadhaarRef != null) {
            String ref = status.applicationNo() != null ? status.applicationNo() : status.engineRef();
            sendNotification(
                    aadhaarRef,
                    "Scheme Application Approved",
                    "Your scheme application " + ref +
                            " has been approved. Disbursement will begin shortly.",
                    "Scheme Application",
                    ref
            );
            confirmCitizenEnrollment(schemeId, familyId, aadhaarRef, applicationNo != null ? applicationNo : ref);
        }

        return status;
    }

    private void confirmCitizenEnrollment(String schemeId, String familyId, String aadhaarRef, String applicationNo) {
        if (schemeId == null || schemeId.isBlank() || familyId == null || familyId.isBlank()) {
            log.warn("Cannot confirm enrollment for {} — missing schemeId or familyId", applicationNo);
            return;
        }
        Map<String, Object> body = Map.of(
                "schemeId", schemeId,
                "familyId", familyId,
                "aadhaarRef", aadhaarRef != null ? aadhaarRef : "",
                "officerName", "Scheme officer",
                "applicationNo", applicationNo != null ? applicationNo : ""
        );
        try {
            webClient.post()
                    .uri(schemeEngineBaseUrl + "/v1/beneficiaries/confirm-application")
                    .header("X-Internal-Key", internalServiceKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .block();
            return;
        } catch (Exception e) {
            log.warn("confirm-application unavailable for {} ({}). Falling back to /confirm.",
                    applicationNo, e.getMessage());
        }
        confirmViaExistingBeneficiary(schemeId, familyId, applicationNo);
    }

    /** Live scheme-engine images may only expose POST /v1/beneficiaries/{id}/confirm. */
    private void confirmViaExistingBeneficiary(String schemeId, String familyId, String applicationNo) {
        try {
            List<Map<String, Object>> rows = webClient.get()
                    .uri(schemeEngineBaseUrl + "/v1/beneficiaries/family/{familyId}", familyId)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<Map<String, Object>>>() {})
                    .block();
            if (rows == null || rows.isEmpty()) {
                log.warn("Cannot confirm {} — no beneficiary rows for family {}", applicationNo, familyId);
                return;
            }
            Map<String, Object> match = rows.stream()
                    .filter(r -> schemeId.equals(String.valueOf(r.get("schemeId"))))
                    .findFirst()
                    .orElse(null);
            if (match == null || match.get("id") == null) {
                log.warn("Cannot confirm {} — no beneficiary row for scheme {}", applicationNo, schemeId);
                return;
            }
            webClient.post()
                    .uri(schemeEngineBaseUrl + "/v1/beneficiaries/{id}/confirm", match.get("id"))
                    .header("X-Internal-Key", internalServiceKey)
                    .bodyValue(Map.of("officerName", "Scheme officer"))
                    .retrieve()
                    .bodyToMono(Void.class)
                    .block();
        } catch (Exception e) {
            log.warn("Approved application {} but failed to mark beneficiary as currently availing: {}",
                    applicationNo, e.getMessage());
        }
    }

    public SchemeApplicationResponse getStatusByApplicationNo(String applicationNo) {
        List<ProcessInstance> active = runtimeService.createProcessInstanceQuery()
                .variableValueEquals("applicationNo", applicationNo)
                .list();
        if (!active.isEmpty()) {
            return getStatus(active.get(0).getId());
        }
        List<HistoricProcessInstance> historical = historyService
                .createHistoricProcessInstanceQuery()
                .variableValueEquals("applicationNo", applicationNo)
                .list();
        if (!historical.isEmpty()) {
            return getStatus(historical.get(0).getId());
        }
        throw new NoSuchElementException("No application found: " + applicationNo);
    }

    public static String extractId(String id) {
        return id.startsWith("FLW-") ? id.substring(4) : id;
    }

    private SchemeApplicationResponse toResponse(String processInstanceId,
                                                 String status,
                                                 Task task,
                                                 Map<String, Object> vars) {
        String candidates = null;
        String currentTask = null;
        String assignee = null;
        if (task != null) {
            currentTask = task.getName();
            assignee = task.getAssignee();
            candidates = taskService.getIdentityLinksForTask(task.getId()).stream()
                    .filter(l -> "candidate".equals(l.getType()) && l.getGroupId() != null)
                    .map(l -> l.getGroupId())
                    .reduce((a, b) -> a + "," + b)
                    .orElse(null);
        }

        Long declaredIncome = longVar(vars, "declaredIncome");
        Long registryIncome = longVar(vars, "registryIncome");
        if (registryIncome != null && registryIncome == -1L) {
            registryIncome = null;
        }

        return new SchemeApplicationResponse(
                "FLW-" + processInstanceId,
                applicationNo(vars, processInstanceId),
                status,
                currentTask,
                assignee,
                candidates,
                stringVar(vars, "aadhaarRef"),
                stringVar(vars, "schemeId"),
                stringVar(vars, "schemeName"),
                stringVar(vars, "familyId"),
                declaredIncome,
                registryIncome,
                stringVar(vars, "eligibilityNotes"),
                taskCreatedAt(task)
        );
    }

    private static String applicationNo(Map<String, Object> vars, String processInstanceId) {
        Object val = vars.get("applicationNo");
        if (val != null && !val.toString().isBlank()) {
            return val.toString();
        }
        return "";
    }

    private static String taskCreatedAt(Task task) {
        return task != null && task.getCreateTime() != null
                ? task.getCreateTime().toInstant().toString()
                : null;
    }

    private static String stringVar(Map<String, Object> vars, String key) {
        Object value = vars.get(key);
        return value != null ? value.toString() : null;
    }

    private static Long longVar(Map<String, Object> vars, String key) {
        Object value = vars.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    private static boolean schemeMatches(Map<String, Object> entry, String schemeName, String schemeId) {
        String registryName = String.valueOf(entry.get("schemeName"));
        return normalize(registryName).equals(normalize(schemeName))
                || normalize(registryName).equals(normalize(schemeId));
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value.replace('_', ' ').replace('-', ' ').trim().toLowerCase();
    }

    private void sendNotification(String aadhaarRef, String title, String message,
                                    String serviceName, String trackingId) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("aadhaarRef", aadhaarRef);
            body.put("title", title);
            body.put("message", message);
            body.put("serviceName", serviceName);
            body.put("trackingId", trackingId);
            restTemplate.postForEntity(NOTIFICATIONS_URL, body, String.class);
        } catch (Exception ignored) {
            // fire-and-forget
        }
    }

    public ApplicationStatsResponse getStats() {
        List<Task> activeTasks = taskService.createTaskQuery().active().list();

        List<HistoricProcessInstance> finished = historyService
                .createHistoricProcessInstanceQuery()
                .finished()
                .list();

        long approved = 0;
        long escalated = 0;
        List<Long> turnaroundHours = new ArrayList<>();
        for (HistoricProcessInstance hp : finished) {
            boolean isEscalated = hp.getEndActivityId() != null
                    && hp.getEndActivityId().toLowerCase().contains("escalation");
            if (isEscalated) {
                escalated++;
            } else {
                approved++;
            }
            if (hp.getStartTime() != null && hp.getEndTime() != null) {
                turnaroundHours.add(Duration.between(
                        hp.getStartTime().toInstant(), hp.getEndTime().toInstant()).toHours());
            }
        }

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        statusCounts.put("PENDING", (long) activeTasks.size());
        statusCounts.put("APPROVED", approved);
        statusCounts.put("ESCALATED", escalated);

        List<HistoricTaskInstance> finishedTasks = historyService
                .createHistoricTaskInstanceQuery()
                .finished()
                .list();
        List<ApplicationStatsResponse.StageStat> stageBreakdown = finishedTasks.stream()
                .collect(Collectors.groupingBy(HistoricTaskInstance::getTaskDefinitionKey))
                .entrySet().stream()
                .map(e -> new ApplicationStatsResponse.StageStat(
                        e.getKey(),
                        round2(avgDurationHours(e.getValue())),
                        e.getValue().size()))
                .sorted(Comparator.comparing(ApplicationStatsResponse.StageStat::stage))
                .collect(Collectors.toList());

        List<ApplicationStatsResponse.AssigneeBacklog> backlogByAssignee = activeTasks.stream()
                .collect(Collectors.groupingBy(
                        t -> t.getAssignee() != null ? t.getAssignee() : "unassigned",
                        Collectors.counting()))
                .entrySet().stream()
                .map(e -> new ApplicationStatsResponse.AssigneeBacklog(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(ApplicationStatsResponse.AssigneeBacklog::pending).reversed())
                .collect(Collectors.toList());

        return new ApplicationStatsResponse(
                statusCounts,
                round2(average(turnaroundHours)),
                round2(median(turnaroundHours)),
                stageBreakdown,
                backlogByAssignee);
    }

    private static double avgDurationHours(List<HistoricTaskInstance> tasks) {
        return tasks.stream()
                .filter(t -> t.getDurationInMillis() != null)
                .mapToLong(HistoricTaskInstance::getDurationInMillis)
                .average()
                .orElse(0) / 3_600_000.0;
    }

    private static double average(List<Long> values) {
        return values.isEmpty() ? 0
                : values.stream().mapToLong(Long::longValue).average().orElse(0);
    }

    private static double median(List<Long> values) {
        if (values.isEmpty()) {
            return 0;
        }
        List<Long> sorted = new ArrayList<>(values);
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
