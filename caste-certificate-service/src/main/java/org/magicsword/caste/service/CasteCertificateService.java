package org.magicsword.caste.service;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.magicsword.caste.model.ApplicationRequest;
import org.magicsword.caste.model.ApplicationResponse;
import org.magicsword.caste.model.ApplicationStatsResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
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
public class CasteCertificateService {

    private static final String NOTIFICATIONS_URL =
            "http://notifications-service.egov.svc.cluster.local:8080/notifications-service/v1/notifications";

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;
    private final RestTemplate restTemplate;
    private final AppNumberService appNumberService;

    public CasteCertificateService(RuntimeService runtimeService,
                                   TaskService taskService,
                                   HistoryService historyService,
                                   RestTemplate restTemplate,
                                   AppNumberService appNumberService) {
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.historyService = historyService;
        this.restTemplate = restTemplate;
        this.appNumberService = appNumberService;
    }

    public ApplicationResponse startApplication(ApplicationRequest req) {
        if (req.aadhaarRef() != null && !req.aadhaarRef().isBlank()) {
            findBlockingApplication(req.aadhaarRef()).ifPresent(this::throwDuplicateConflict);
        }
        String applicationNo = appNumberService.next("CAS");
        Map<String, Object> vars = new HashMap<>();
        vars.put("applicationNo", applicationNo);
        vars.put("applicantName", req.applicantName());
        vars.put("casteCode", req.casteCode());
        vars.put("tenantId", req.tenantId());
        vars.put("assignee", "data-entry-officer");
        if (req.aadhaarRef() != null) {
            vars.put("aadhaarRef", req.aadhaarRef());
        }
        ProcessInstance instance = runtimeService
                .startProcessInstanceByKey("casteCertificateApproval", vars);
        return ApplicationResponse.started(
                instance.getId(),
                applicationNo,
                req.aadhaarRef(),
                req.applicantName(),
                req.casteCode(),
                req.tenantId()
        );
    }

    public ApplicationResponse getStatus(String processInstanceId) {
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (!activeTasks.isEmpty()) {
            Task task = activeTasks.get(0);
            String candidates = taskService.getIdentityLinksForTask(task.getId()).stream()
                    .filter(l -> "candidate".equals(l.getType()) && l.getGroupId() != null)
                    .map(l -> l.getGroupId())
                    .reduce((a, b) -> a + "," + b)
                    .orElse(null);
            Map<String, Object> vars = runtimeService.getVariables(processInstanceId);
            String applicantName = (String) vars.getOrDefault("applicantName", "");
            String casteCode = (String) vars.getOrDefault("casteCode", "");
            String tenantId = (String) vars.getOrDefault("tenantId", "pg");
            return new ApplicationResponse(
                    "FLW-" + processInstanceId,
                    applicationNo(vars, processInstanceId, true),
                    "PENDING",
                    task.getName(),
                    task.getAssignee(),
                    candidates,
                    stringVar(vars, "aadhaarRef"),
                    applicantName,
                    casteCode,
                    tenantId,
                    taskCreatedAt(task)
            );
        }

        HistoricProcessInstance historic = historyService
                .createHistoricProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        if (historic == null) {
            throw new NoSuchElementException("No process instance found: " + processInstanceId);
        }

        List<HistoricVariableInstance> hvs = historyService
                .createHistoricVariableInstanceQuery()
                .processInstanceId(processInstanceId)
                .list();
        Map<String, Object> vars = hvs.stream().collect(
                Collectors.toMap(HistoricVariableInstance::getVariableName,
                        HistoricVariableInstance::getValue));
        String applicantName = (String) vars.getOrDefault("applicantName", "");
        String casteCode = (String) vars.getOrDefault("casteCode", "");
        String tenantId = (String) vars.getOrDefault("tenantId", "pg");

        boolean escalated = "Escalated (SLA Breach)".equals(historic.getDeleteReason())
                || (historic.getEndActivityId() != null
                    && historic.getEndActivityId().contains("escalation"));

        String finalStatus = escalated ? "ESCALATED" : "APPROVED";
        return new ApplicationResponse(
                "FLW-" + processInstanceId,
                applicationNo(vars, processInstanceId, true),
                finalStatus,
                null,
                null,
                null,
                stringVar(vars, "aadhaarRef"),
                applicantName,
                casteCode,
                tenantId,
                null
        );
    }

    public List<ApplicationResponse> listActive() {
        return taskService.createTaskQuery()
                .active()
                .orderByTaskCreateTime().asc()
                .list()
                .stream()
                .map(task -> {
                    String candidates = taskService.getIdentityLinksForTask(task.getId())
                            .stream()
                            .filter(l -> "candidate".equals(l.getType()) && l.getGroupId() != null)
                            .map(l -> l.getGroupId())
                            .reduce((a, b) -> a + "," + b)
                            .orElse(null);
                    Map<String, Object> vars = runtimeService.getVariables(task.getProcessInstanceId());
                    String applicantName = (String) vars.getOrDefault("applicantName", "");
                    String casteCode = (String) vars.getOrDefault("casteCode", "");
                    String tenantId = (String) vars.getOrDefault("tenantId", "pg");
                    return new ApplicationResponse(
                            "FLW-" + task.getProcessInstanceId(),
                            applicationNo(vars, task.getProcessInstanceId(), false),
                            "PENDING",
                            task.getName(),
                            task.getAssignee(),
                            candidates,
                            stringVar(vars, "aadhaarRef"),
                            applicantName,
                            casteCode,
                            tenantId,
                            taskCreatedAt(task)
                    );
                })
                .collect(Collectors.toList());
    }

    public List<ApplicationResponse> listAll() {
        java.util.Set<String> refs = historyService.createHistoricVariableInstanceQuery()
                .variableName("aadhaarRef")
                .list()
                .stream()
                .filter(hv -> hv.getValue() != null)
                .map(hv -> hv.getValue().toString())
                .filter(r -> !r.isBlank())
                .collect(java.util.stream.Collectors.toSet());
        java.util.Set<String> seen = new java.util.HashSet<>();
        List<ApplicationResponse> result = new java.util.ArrayList<>();
        for (String ref : refs) {
            for (ApplicationResponse app : listByAadhaar(ref)) {
                if (seen.add(app.engineRef())) {
                    result.add(app);
                }
            }
        }
        return result;
    }

    public List<ApplicationResponse> listByAadhaar(String aadhaar) {
        List<ApplicationResponse> active = taskService.createTaskQuery()
                .processVariableValueEquals("aadhaarRef", aadhaar)
                .active()
                .list()
                .stream()
                .map(task -> {
                    String candidates = taskService.getIdentityLinksForTask(task.getId())
                            .stream()
                            .filter(l -> "candidate".equals(l.getType()) && l.getGroupId() != null)
                            .map(l -> l.getGroupId())
                            .reduce((a, b) -> a + "," + b)
                            .orElse(null);
                    Map<String, Object> vars = runtimeService.getVariables(task.getProcessInstanceId());
                    String applicantName = (String) vars.getOrDefault("applicantName", "");
                    String casteCode = (String) vars.getOrDefault("casteCode", "");
                    String tenantId = (String) vars.getOrDefault("tenantId", "pg");
                    return new ApplicationResponse(
                            "FLW-" + task.getProcessInstanceId(),
                            applicationNo(vars, task.getProcessInstanceId(), false),
                            "PENDING",
                            task.getName(),
                            task.getAssignee(),
                            candidates,
                            stringVar(vars, "aadhaarRef"),
                            applicantName,
                            casteCode,
                            tenantId,
                            taskCreatedAt(task)
                    );
                })
                .collect(Collectors.toList());

        List<ApplicationResponse> finished = historyService.createHistoricProcessInstanceQuery()
                .variableValueEquals("aadhaarRef", aadhaar)
                .finished()
                .list()
                .stream()
                .map(historic -> getStatus(historic.getId()))
                .collect(Collectors.toList());

        List<ApplicationResponse> result = new java.util.ArrayList<>(active);
        result.addAll(finished);
        return result;
    }

    private Optional<ApplicationResponse> findBlockingApplication(String aadhaarRef) {
        return listByAadhaar(aadhaarRef).stream()
                .filter(app -> isBlockingStatus(app.status()))
                .findFirst();
    }

    private static boolean isBlockingStatus(String status) {
        return "PENDING".equals(status) || "APPROVED".equals(status);
    }

    private void throwDuplicateConflict(ApplicationResponse existing) {
        String ref = existing.applicationNo() != null && !existing.applicationNo().isBlank()
                ? existing.applicationNo()
                : existing.engineRef();
        String message = "APPROVED".equals(existing.status())
                ? "Caste certificate already issued: " + ref
                : "Caste certificate application already in progress: " + ref;
        throw new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public ApplicationResponse approve(String processInstanceId) {
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
        ApplicationResponse status = getStatus(processInstanceId);

        if ("APPROVED".equals(status.status()) && aadhaarRef != null) {
            String casteCode = (String) vars.getOrDefault("casteCode", "");
            String trackingId = status.applicationNo() != null && !status.applicationNo().isBlank()
                    ? status.applicationNo()
                    : status.engineRef();
            sendNotification(
                    aadhaarRef,
                    "Caste Certificate Application Approved",
                    "Your Caste Certificate (" + casteCode + ") application " + trackingId +
                            " has been approved. You can now use it for OBC Scholarship and other scheme applications.",
                    "Caste Certificate",
                    trackingId
            );
        }

        return status;
    }

    public String getAadhaarRef(String processInstanceId) {
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();
        if (!activeTasks.isEmpty()) {
            Object val = runtimeService.getVariable(processInstanceId, "aadhaarRef");
            return val != null ? val.toString() : null;
        }
        HistoricVariableInstance hv = historyService.createHistoricVariableInstanceQuery()
                .processInstanceId(processInstanceId)
                .variableName("aadhaarRef")
                .singleResult();
        return hv != null && hv.getValue() != null ? hv.getValue().toString() : null;
    }

    public ApplicationResponse getStatusByApplicationNo(String applicationNo) {
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

    private static String stringVar(Map<String, Object> vars, String key) {
        Object value = vars.get(key);
        return value != null ? value.toString() : null;
    }

    private static String applicationNo(Map<String, Object> vars, String processInstanceId, boolean legacyFallback) {
        Object val = vars.get("applicationNo");
        if (val != null && !val.toString().isBlank()) {
            return val.toString();
        }
        if (legacyFallback) {
            return "CAS-" + processInstanceId.substring(0, Math.min(6, processInstanceId.length())).toUpperCase();
        }
        return "";
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

    private static String taskCreatedAt(Task task) {
        return task != null && task.getCreateTime() != null
                ? task.getCreateTime().toInstant().toString()
                : null;
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
            boolean isEscalated = "Escalated (SLA Breach)".equals(hp.getDeleteReason())
                    || (hp.getEndActivityId() != null && hp.getEndActivityId().contains("escalation"));
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
