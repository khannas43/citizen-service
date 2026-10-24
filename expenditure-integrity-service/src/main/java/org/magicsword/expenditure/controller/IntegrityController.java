package org.magicsword.expenditure.controller;

import org.magicsword.expenditure.domain.ActionType;
import org.magicsword.expenditure.domain.CaseClassification;
import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.IntegrityAction;
import org.magicsword.expenditure.entity.IntegrityCase;
import org.magicsword.expenditure.service.CaseFileService;
import org.magicsword.expenditure.service.CaseTimelineService;
import org.magicsword.expenditure.service.IntegrityCaseService;
import org.magicsword.expenditure.service.NoticeService;
import org.magicsword.expenditure.service.PayrollFilterOptionsService;
import org.magicsword.expenditure.service.PersonViewService;
import org.magicsword.expenditure.service.PriorityService;
import org.magicsword.expenditure.security.DomainAccess;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1")
@CrossOrigin(originPatterns = "*")
public class IntegrityController {

    private final IntegrityCaseService caseService;
    private final CaseTimelineService timelineService;
    private final PayrollFilterOptionsService payrollFilterOptions;
    private final DomainAccess access;
    private final CaseFileService caseFileService;
    private final PersonViewService personView;
    private final NoticeService noticeService;
    private final PriorityService priorityService;

    public IntegrityController(
            IntegrityCaseService caseService,
            CaseTimelineService timelineService,
            PayrollFilterOptionsService payrollFilterOptions,
            DomainAccess access,
            CaseFileService caseFileService,
            PersonViewService personView,
            NoticeService noticeService,
            PriorityService priorityService) {
        this.caseService = caseService;
        this.timelineService = timelineService;
        this.payrollFilterOptions = payrollFilterOptions;
        this.access = access;
        this.caseFileService = caseFileService;
        this.personView = personView;
        this.noticeService = noticeService;
        this.priorityService = priorityService;
    }

    @GetMapping("/alerts")
    public ResponseEntity<?> listAlerts(
            @RequestParam(required = false) IntegrityDomain domain,
            @RequestParam(required = false) String ruleCode,
            @RequestParam(required = false, defaultValue = "OPEN") String status,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka,
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) String ddoCode,
            @RequestParam(required = false) ActionType actionType,
            @RequestParam(required = false) LocalDate periodStart,
            @RequestParam(required = false) LocalDate periodEnd,
            Authentication auth) {
        access.requireRead(auth, domain);
        if (periodStart != null && periodEnd != null && periodStart.isAfter(periodEnd)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Pay period start must be on or before end."));
        }
        var alerts = caseService.listAlerts(domain, ruleCode, status, district, taluka, schemeId, ddoCode, actionType,
                periodStart, periodEnd);
        if (alerts == null) return ResponseEntity.ok(java.util.List.of());
        var visible = alerts.stream().filter(a -> access.canRead(auth, a.getDomain())).toList();
        priorityService.applyPriority(visible);
        return ResponseEntity.ok(visible);
    }

    @GetMapping("/people/linked-registry-ids")
    public ResponseEntity<Map<String, java.util.Set<String>>> linkedRegistryIds(
            @RequestParam("personIds") java.util.List<String> personIds,
            Authentication auth) {
        access.requireRead(auth, IntegrityDomain.BENEFICIARY);
        return ResponseEntity.ok(Map.of("linkedPersonIds", personView.linkedRegistryIds(personIds)));
    }

    @GetMapping("/people/{personKey}/overview")
    public ResponseEntity<Map<String, Object>> personOverview(@PathVariable String personKey, Authentication auth) {
        if (!access.canRead(auth, IntegrityDomain.BENEFICIARY) && !access.canRead(auth, IntegrityDomain.PAYROLL)) {
            access.requireRead(auth, IntegrityDomain.BENEFICIARY);
        }
        return ResponseEntity.ok(personView.overview(personKey, auth));
    }

    @GetMapping("/payroll/filter-options")
    public ResponseEntity<Map<String, java.util.List<String>>> payrollFilterOptions(
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String taluka,
            Authentication auth) {
        access.requireRead(auth, IntegrityDomain.PAYROLL);
        return ResponseEntity.ok(payrollFilterOptions.options(district, taluka));
    }

    @GetMapping("/cases/{id}")
    public ResponseEntity<?> caseDetail(@PathVariable UUID id, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return caseService.getCaseDetail(id)
                .map(d -> {
                    java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
                    body.put("caseEntity", d.caseEntity());
                    body.put("alerts", d.alerts());
                    body.put("actions", d.actions());
                    body.put("auditLog", d.auditLog());
                    body.put("evidenceContext", d.evidenceContext());
                    noticeService.latestNotice(id).ifPresent(n -> body.put("notice", n));
                    return ResponseEntity.ok(body);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/cases/{id}/timeline")
    public ResponseEntity<?> timeline(@PathVariable UUID id, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return timelineService.timeline(id).<ResponseEntity<?>>map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/cases/{id}/export")
    public ResponseEntity<?> exportCase(@PathVariable UUID id,
                                        @RequestParam(defaultValue = "html") String format,
                                        Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return caseFileService.build(id, auth)
                .<ResponseEntity<?>>map(file -> {
                    if ("json".equalsIgnoreCase(format)) {
                        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(file.json());
                    }
                    return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(file.html());
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/cases/{id}/assign")
    public ResponseEntity<IntegrityCase> assign(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                                @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireReview(auth, d));
        return ResponseEntity.ok(caseService.assign(id, body.get("assignee"), jwt));
    }

    @PostMapping("/cases/{id}/decision")
    public ResponseEntity<IntegrityCase> decision(@PathVariable UUID id, @RequestBody DecisionRequest body,
                                                  @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireReview(auth, d));
        return ResponseEntity.ok(caseService.recordDecision(
                id, body.classification(), body.decisionText(), body.noticeRequired(), jwt));
    }

    @PostMapping("/cases/{id}/verify-closed")
    public ResponseEntity<IntegrityCase> verifyClosed(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                                      @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));       // the URL rule already limits who may verify
        return ResponseEntity.ok(caseService.verifyClosed(id, body.get("note"), jwt));
    }

    @PostMapping("/cases/{id}/reopen")
    public ResponseEntity<IntegrityCase> reopen(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                                @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return ResponseEntity.ok(caseService.reopenOnAppeal(id, body.get("reason"), jwt));
    }

    @PostMapping("/cases/{id}/actions")
    public ResponseEntity<IntegrityAction> action(@PathVariable UUID id, @RequestBody ActionRequest body,
                                                  @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));       // the URL rule already limits who may record outcomes
        return ResponseEntity.ok(caseService.recordAction(id, body.actionType(), body.payload(), jwt));
    }

    @PostMapping("/cases/{id}/actions/{actionId}/approve")
    public ResponseEntity<IntegrityAction> approveRecovery(@PathVariable UUID id, @PathVariable UUID actionId,
                                                           @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return ResponseEntity.ok(caseService.approveRecovery(id, actionId, jwt));
    }

    @PostMapping("/cases/{id}/actions/{actionId}/reject")
    public ResponseEntity<IntegrityAction> rejectRecovery(@PathVariable UUID id, @PathVariable UUID actionId,
                                                          @RequestBody Map<String, String> body,
                                                          @AuthenticationPrincipal Jwt jwt, Authentication auth) {
        caseService.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return ResponseEntity.ok(caseService.rejectRecovery(id, actionId, body.get("reason"), jwt));
    }

    public record DecisionRequest(CaseClassification classification, String decisionText, boolean noticeRequired) {}
    public record ActionRequest(ActionType actionType, Map<String, Object> payload) {}
}
