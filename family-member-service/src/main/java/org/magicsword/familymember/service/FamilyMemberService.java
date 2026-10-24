package org.magicsword.familymember.service;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.magicsword.familymember.model.ApplicationStatsResponse;
import org.magicsword.familymember.model.FamilyMemberRequest;
import org.magicsword.familymember.model.FamilyMemberResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Service
public class FamilyMemberService {

    private static final Logger log = LoggerFactory.getLogger(FamilyMemberService.class);

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;
    private final WebClient webClient;
    private final String familyRegistryBaseUrl;
    private final AppNumberService appNumberService;

    public FamilyMemberService(RuntimeService runtimeService,
                               TaskService taskService,
                               HistoryService historyService,
                               WebClient.Builder webClientBuilder,
                               @Value("${family.registry.base-url}") String familyRegistryBaseUrl,
                               AppNumberService appNumberService) {
        this.runtimeService = runtimeService;
        this.taskService = taskService;
        this.historyService = historyService;
        this.webClient = webClientBuilder.build();
        this.familyRegistryBaseUrl = familyRegistryBaseUrl;
        this.appNumberService = appNumberService;
    }

    public FamilyMemberResponse startApplication(FamilyMemberRequest req) {
        Map<String, Object> vars = new HashMap<>();
        String applicationNo = appNumberService.next("FAM");
        vars.put("applicationNo", applicationNo);
        vars.put("familyId", req.familyId());
        vars.put("changeType", req.changeType());
        vars.put("personName", req.personName());
        vars.put("personId", req.personId());
        vars.put("dob", req.dob());
        vars.put("gender", req.gender());
        vars.put("relationshipToHead", req.relationshipToHead());
        vars.put("occupation", req.occupation());
        vars.put("annualIncome", req.annualIncome());
        vars.put("casteCategory", req.casteCategory());
        vars.put("mobile", req.mobile());
        vars.put("reason", req.reason());
        vars.put("tenantId", req.tenantId());
        vars.put("assignee", "talati");

        var instance = runtimeService.startProcessInstanceByKey("familyMemberChange", vars);
        return FamilyMemberResponse.started(
                instance.getId(),
                applicationNo,
                req.familyId(),
                req.changeType(),
                req.personName(),
                req.reason()
        );
    }

    public FamilyMemberResponse getStatus(String processInstanceId) {
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

    public List<FamilyMemberResponse> listActive() {
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

    public List<FamilyMemberResponse> listByAadhaar(String aadhaar) {
        // Family member changes are keyed by familyId, not the requesting citizen's
        // aadhaarRef, so resolve which family this citizen belongs to first.
        String familyId = resolveFamilyId(aadhaar);
        if (familyId == null) {
            return java.util.Collections.emptyList();
        }

        List<FamilyMemberResponse> active = taskService.createTaskQuery()
                .processVariableValueEquals("familyId", familyId)
                .active()
                .list()
                .stream()
                .map(task -> {
                    Map<String, Object> vars = runtimeService.getVariables(task.getProcessInstanceId());
                    return toResponse(task.getProcessInstanceId(), "PENDING", task, vars);
                })
                .collect(Collectors.toList());

        List<FamilyMemberResponse> finished = historyService.createHistoricProcessInstanceQuery()
                .variableValueEquals("familyId", familyId)
                .finished()
                .list()
                .stream()
                .map(historic -> getStatus(historic.getId()))
                .collect(Collectors.toList());

        List<FamilyMemberResponse> result = new ArrayList<>(active);
        result.addAll(finished);
        return result;
    }

    @SuppressWarnings("unchecked")
    private String resolveFamilyId(String aadhaar) {
        try {
            Map<String, Object> body = webClient.get()
                    .uri(familyRegistryBaseUrl + "/v1/persons/search?aadhaar={aadhaar}", aadhaar)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            if (body == null) {
                return null;
            }
            List<Map<String, Object>> results = (List<Map<String, Object>>) body.get("results");
            if (results == null || results.isEmpty()) {
                return null;
            }
            Object familyId = results.get(0).get("familyId");
            return familyId != null ? familyId.toString() : null;
        } catch (Exception ex) {
            log.error("Failed to resolve familyId for aadhaar {}: {}", aadhaar, ex.getMessage());
            return null;
        }
    }

    public FamilyMemberResponse approve(String processInstanceId) {
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (activeTasks.isEmpty()) {
            return getStatus(processInstanceId);
        }

        Map<String, Object> vars = runtimeService.getVariables(processInstanceId);
        taskService.complete(activeTasks.get(0).getId());

        List<Task> remaining = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();

        if (remaining.isEmpty()) {
            HistoricProcessInstance historic = historyService.createHistoricProcessInstanceQuery()
                    .processInstanceId(processInstanceId)
                    .singleResult();
            boolean escalated = historic != null
                    && historic.getEndActivityId() != null
                    && historic.getEndActivityId().toLowerCase().contains("escalation");
            if (!escalated) {
                syncToFamilyRegistry(vars);
            }
        }

        return getStatus(processInstanceId);
    }

    public FamilyMemberResponse getStatusByApplicationNo(String applicationNo) {
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

    private void syncToFamilyRegistry(Map<String, Object> vars) {
        String familyId = stringVar(vars, "familyId");
        String changeType = stringVar(vars, "changeType");
        if (familyId == null || changeType == null) {
            return;
        }

        try {
            if ("ADD".equalsIgnoreCase(changeType)) {
                Map<String, Object> body = new HashMap<>();
                body.put("name", stringVar(vars, "personName"));
                body.put("dob", stringVar(vars, "dob"));
                body.put("gender", stringVar(vars, "gender"));
                body.put("occupation", stringVar(vars, "occupation"));
                body.put("annualIncome", parseLong(stringVar(vars, "annualIncome")));
                body.put("casteCategory", stringVar(vars, "casteCategory"));
                body.put("mobile", stringVar(vars, "mobile"));
                body.put("relationshipToHead", stringVar(vars, "relationshipToHead"));

                webClient.post()
                        .uri(familyRegistryBaseUrl + "/v1/families/{id}/members", familyId)
                        .bodyValue(body)
                        .retrieve()
                        .bodyToMono(Void.class)
                        .block();
            } else if ("DELETE".equalsIgnoreCase(changeType)) {
                String personId = stringVar(vars, "personId");
                if (personId != null) {
                    webClient.delete()
                            .uri(familyRegistryBaseUrl + "/v1/families/{id}/members/{personId}",
                                    familyId, personId)
                            .retrieve()
                            .bodyToMono(Void.class)
                            .block();
                }
            }
        } catch (Exception ex) {
            log.error("Failed to sync family member change to registry: {}", ex.getMessage());
        }
    }

    private FamilyMemberResponse toResponse(String processInstanceId,
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

        return new FamilyMemberResponse(
                "FLW-" + processInstanceId,
                applicationNo(vars, processInstanceId),
                status,
                currentTask,
                assignee,
                candidates,
                stringVar(vars, "familyId"),
                stringVar(vars, "changeType"),
                stringVar(vars, "personName"),
                stringVar(vars, "reason"),
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

    private static Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return 0L;
        }
        return Long.parseLong(value);
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
