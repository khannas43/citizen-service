package org.magicsword.pension.service;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.magicsword.pension.model.ApplicationStatsResponse;
import org.magicsword.pension.model.PensionRequest;
import org.magicsword.pension.model.PensionResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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
public class PensionService {

    private static final Logger log = LoggerFactory.getLogger(PensionService.class);
    private static final String NOTIFICATIONS_URL =
            "http://notifications-service.egov.svc.cluster.local:8080/notifications-service/v1/notifications";

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;
    private final WebClient webClient;
    private final RestTemplate restTemplate;
    private final String familyRegistryBaseUrl;
    private final AppNumberService appNumberService;

    public PensionService(RuntimeService runtimeService,
                          TaskService taskService,
                          HistoryService historyService,
                          WebClient.Builder webClientBuilder,
                          RestTemplate restTemplate,
                          @Value("${family.registry.base-url}") String familyRegistryBaseUrl,
                          AppNumberService appNumberService) {
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.historyService = historyService;
        this.webClient = webClientBuilder.build();
        this.restTemplate = restTemplate;
        this.familyRegistryBaseUrl = familyRegistryBaseUrl;
        this.appNumberService = appNumberService;
    }

    public PensionResponse startApplication(PensionRequest req) {
        if (req.aadhaarRef() != null && !req.aadhaarRef().isBlank() && req.pensionType() != null) {
            findBlockingApplication(req.aadhaarRef(), req.pensionType()).ifPresent(this::throwDuplicateConflict);
        }
        String familyIncome = null;
        if (req.familyId() != null && !req.familyId().isBlank()) {
            try {
                Map<?, ?> income = webClient.get()
                        .uri(familyRegistryBaseUrl + "/v1/families/{id}/income", req.familyId())
                        .retrieve()
                        .bodyToMono(Map.class)
                        .block();
                if (income != null && income.get("totalAnnualIncome") != null) {
                    familyIncome = "₹" + income.get("totalAnnualIncome");
                }
            } catch (Exception ex) {
                log.warn("Failed to fetch family income for {}: {}", req.familyId(), ex.getMessage());
            }
        }

        Map<String, Object> vars = new HashMap<>();
        String applicationNo = appNumberService.next("PEN");
        vars.put("applicationNo", applicationNo);
        vars.put("applicantName", req.applicantName());
        vars.put("pensionType", req.pensionType());
        vars.put("aadhaarRef", req.aadhaarRef());
        vars.put("tenantId", req.tenantId());
        vars.put("familyIncome", familyIncome != null ? familyIncome : "N/A");
        vars.put("assignee", "revenue-officer");

        var instance = runtimeService.startProcessInstanceByKey("pensionApplication", vars);
        return PensionResponse.started(
                instance.getId(),
                applicationNo,
                req.applicantName(),
                req.pensionType(),
                req.aadhaarRef(),
                familyIncome
        );
    }

    public PensionResponse getStatus(String processInstanceId) {
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

    public List<PensionResponse> listActive() {
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

    public List<PensionResponse> listByAadhaar(String aadhaar) {
        // Active (pending) tasks
        List<PensionResponse> active = taskService.createTaskQuery()
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
        List<PensionResponse> finished = historyService.createHistoricProcessInstanceQuery()
                .variableValueEquals("aadhaarRef", aadhaar)
                .finished()
                .list()
                .stream()
                .map(historic -> getStatus(historic.getId()))
                .collect(Collectors.toList());

        List<PensionResponse> result = new java.util.ArrayList<>(active);
        result.addAll(finished);
        return result;
    }

    private Optional<PensionResponse> findBlockingApplication(String aadhaarRef, String pensionType) {
        return listByAadhaar(aadhaarRef).stream()
                .filter(app -> pensionType.equals(app.pensionType()) && isBlockingStatus(app.status()))
                .findFirst();
    }

    private static boolean isBlockingStatus(String status) {
        return "PENDING".equals(status) || "APPROVED".equals(status);
    }

    private void throwDuplicateConflict(PensionResponse existing) {
        String ref = existing.applicationNo() != null && !existing.applicationNo().isBlank()
                ? existing.applicationNo()
                : existing.engineRef();
        String message = "APPROVED".equals(existing.status())
                ? "Pension application already approved: " + ref
                : "Pension application already in progress: " + ref;
        throw new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public PensionResponse approve(String processInstanceId) {
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

        taskService.complete(task.getId());
        PensionResponse status = getStatus(processInstanceId);

        if ("APPROVED".equals(status.status()) && aadhaarRef != null) {
            sendNotification(
                    aadhaarRef,
                    "Pension Application Approved",
                    "Your Old Age Pension application " + status.engineRef() +
                            " has been approved. Your first pension instalment will be credited within 30 days.",
                    "Pension",
                    status.engineRef()
            );
        }

        return status;
    }

    public PensionResponse getStatusByApplicationNo(String applicationNo) {
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

    private PensionResponse toResponse(String processInstanceId,
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

        return new PensionResponse(
                "FLW-" + processInstanceId,
                applicationNo(vars, processInstanceId),
                status,
                currentTask,
                assignee,
                candidates,
                stringVar(vars, "applicantName"),
                stringVar(vars, "pensionType"),
                stringVar(vars, "aadhaarRef"),
                stringVar(vars, "familyIncome"),
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
