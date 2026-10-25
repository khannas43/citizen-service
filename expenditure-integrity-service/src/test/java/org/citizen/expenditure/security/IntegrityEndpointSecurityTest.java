package org.citizen.expenditure.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.citizen.expenditure.controller.AdminIntegrityController;
import org.citizen.expenditure.controller.IntegrityController;
import org.citizen.expenditure.controller.PaymentGateController;
import org.citizen.expenditure.controller.NoticeController;
import org.citizen.expenditure.controller.OverviewController;
import org.citizen.expenditure.controller.StoryController;
import org.citizen.expenditure.service.*;
import org.citizen.expenditure.security.OfficerSecurityConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.reactive.function.client.WebClient;

import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {IntegrityController.class, AdminIntegrityController.class, PaymentGateController.class, OverviewController.class, StoryController.class, NoticeController.class})
@Import({OfficerSecurityConfig.class, DomainAccess.class})
@TestPropertySource(properties = {
        "officer.jwks-uri=https://example.test/jwks",
        "officer.integrity.allowed-roles=SCHEME_DEPT,DEPT_ADMIN,REVENUE_OFFICER,IT_ADMIN,PAYROLL_REVIEWER,FINANCE_OFFICER,HR_OFFICER",
        "officer.integrity.admin-roles=IT_ADMIN,DEPT_ADMIN",
        "officer.integrity.review-roles=SCHEME_DEPT,DEPT_ADMIN,REVENUE_OFFICER,PAYROLL_REVIEWER",
        "officer.integrity.action-roles=DEPT_ADMIN,FINANCE_OFFICER",
        "officer.integrity.fraud-roles=REVENUE_OFFICER,DEPT_ADMIN",
        "officer.integrity.gate-roles=DEPT_ADMIN,FINANCE_OFFICER",
        "officer.integrity.overview-roles=SCHEME_DEPT,DEPT_ADMIN,REVENUE_OFFICER,IT_ADMIN,FINANCE_OFFICER,SENIOR_MGMT"
})
class IntegrityEndpointSecurityTest {

    @Autowired MockMvc mvc;

    @MockBean JwtDecoder jwtDecoder;
    @MockBean IntegrityCaseService caseService;
    @MockBean DetectionEngineService detectionEngine;
    @MockBean ImportService importService;
    @MockBean PayrollImportService payrollImportService;
    @MockBean AcceptanceMetricsService metricsService;
    @MockBean PaymentGateService paymentGateService;
    @MockBean OverviewService overviewService;
    @MockBean CaseTimelineService caseTimelineService;
    @MockBean StoryService storyService;
    @MockBean LegacyFraudSignalsService legacyFraudSignalsService;
    @MockBean TalukaCoverageService coverageService;
    @MockBean PayrollFilterOptionsService payrollFilterOptionsService;
    @MockBean WhatIfService whatIfService;
    @MockBean CaseFileService caseFileService;
    @MockBean WebClient schemeEngineWebClient;
    @MockBean PersonViewService personViewService;
    @MockBean ReadinessService readinessService;
    @MockBean NoticeService noticeService;
    @MockBean PriorityService priorityService;
    @MockBean org.citizen.expenditure.repository.VerificationEventRepository verificationEventRepo;

    @BeforeEach
    void stubCaseFileAndRecovery() {
        when(caseService.approveRecovery(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.citizen.expenditure.entity.IntegrityAction());
        when(caseService.rejectRecovery(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.citizen.expenditure.entity.IntegrityAction());
    }

    @Test
    void personOverviewFollowsCaseReadRolesAndBlocksSeniorManagement() throws Exception {
        when(personViewService.overview(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Map.of("linked", false));
        String url = "/v1/people/50000005-0000-0000-0000-000000000001/overview";
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get(url).with(as("SCHEME_DEPT"))).andExpect(status().isOk());
        mvc.perform(get(url).with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get(url).with(as("HR_OFFICER"))).andExpect(status().isOk());
        mvc.perform(get(url).with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());
    }

    @Test
    void linkedRegistryIdsNeedBeneficiaryRead() throws Exception {
        when(personViewService.linkedRegistryIds(org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(java.util.Set.of("50000005-0000-0000-0000-000000000001"));
        String url = "/v1/people/linked-registry-ids?personIds=50000005-0000-0000-0000-000000000001";
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get(url).with(as("SCHEME_DEPT"))).andExpect(status().isOk());
        mvc.perform(get(url).with(as("HR_OFFICER"))).andExpect(status().isForbidden());
    }

    @Test
    void alertsRequireAuth() throws Exception {
        mvc.perform(get("/v1/alerts")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminRunRequiresAdminRole() throws Exception {
        mvc.perform(post("/v1/admin/run-detection")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/v1/admin/run-detection")
                        .contentType("application/json")
                        .content("{}")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_SCHEME_DEPT"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void schemeDeptCanReadAlerts() throws Exception {
        when(caseService.listAlerts(null, null, "OPEN", null, null, null, null, null, null, null)).thenReturn(List.of());
        mvc.perform(get("/v1/alerts")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_SCHEME_DEPT"))))
                .andExpect(status().isOk());
    }

    // ---- who may do what ------------------------------------------------------------------------------------

    private static final String CASE = "11111111-1111-1111-1111-111111111111";
    private static final String JSON = "application/json";

    private static org.springframework.test.web.servlet.request.RequestPostProcessor as(String role) {
        return jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
    }

    private static org.springframework.test.web.servlet.ResultMatcher allowed() {
        return result -> org.junit.jupiter.api.Assertions.assertFalse(
                result.getResponse().getStatus() == 401 || result.getResponse().getStatus() == 403,
                "blocked by security: HTTP " + result.getResponse().getStatus());
    }

    @Test
    void everyOfficerRoleThatReviewsOrOperatesCanRead() throws Exception {
        for (String role : List.of("SCHEME_DEPT", "DEPT_ADMIN", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(get("/v1/alerts").with(as(role))).andExpect(allowed());
            mvc.perform(get("/v1/cases/" + CASE).with(as(role))).andExpect(allowed());
        }
        mvc.perform(get("/v1/alerts").with(as("TALATI"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/cases/" + CASE)).andExpect(status().isUnauthorized());
    }

    @Test
    void assigningAndDecidingIsForReviewersNotForItAdmin() throws Exception {
        for (String path : List.of("assign", "decision")) {
            mvc.perform(post("/v1/cases/" + CASE + "/" + path).contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
            for (String role : List.of("SCHEME_DEPT", "DEPT_ADMIN", "REVENUE_OFFICER")) {
                mvc.perform(post("/v1/cases/" + CASE + "/" + path).with(as(role)).contentType(JSON).content("{}")).andExpect(allowed());
            }
            for (String role : List.of("IT_ADMIN", "TALATI")) {
                mvc.perform(post("/v1/cases/" + CASE + "/" + path).with(as(role)).contentType(JSON).content("{}")).andExpect(status().isForbidden());
            }
        }
    }

    @Test
    void approvingOrRejectingARecoveryIsForOutcomeRolesOnly() throws Exception {
        UUID actionId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String approve = "/v1/cases/" + CASE + "/actions/" + actionId + "/approve";
        String reject = "/v1/cases/" + CASE + "/actions/" + actionId + "/reject";
        mvc.perform(post(approve)).andExpect(status().isUnauthorized());
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(post(approve).with(as(role))).andExpect(status().isForbidden());
            mvc.perform(post(reject).with(as(role)).contentType(JSON).content("{\"reason\":\"no\"}")).andExpect(status().isForbidden());
        }
        mvc.perform(post(approve).with(as("DEPT_ADMIN"))).andExpect(allowed());
        mvc.perform(post(reject).with(as("FINANCE_OFFICER")).contentType(JSON).content("{\"reason\":\"no\"}")).andExpect(allowed());
    }

    @Test
    void recordingAMasterCorrectionPaymentAdjustmentOrRecoveryIsForDeptAdminOnly() throws Exception {
        mvc.perform(post("/v1/cases/" + CASE + "/actions").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/cases/" + CASE + "/actions").with(as("DEPT_ADMIN")).contentType(JSON).content("{}")).andExpect(allowed());
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(post("/v1/cases/" + CASE + "/actions").with(as(role)).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        }
    }

    @Test
    void theTimelineIsReadableByCaseReadersAndNotBySeniorManagement() throws Exception {
        String url = "/v1/cases/" + CASE + "/timeline";
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        for (String role : List.of("SCHEME_DEPT", "DEPT_ADMIN", "FINANCE_OFFICER")) {
            mvc.perform(get(url).with(as(role))).andExpect(allowed());
        }
        mvc.perform(get(url).with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());
    }

    @Test
    void caseExportFollowsTheSameReadRulesAsCaseDetail() throws Exception {
        knownCases();
        when(caseFileService.build(org.mockito.ArgumentMatchers.eq(java.util.UUID.fromString(BENEFICIARY_CASE)), org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of(new CaseFileService.CaseFileExport(java.util.Map.of(), "<html></html>")));
        when(caseFileService.build(org.mockito.ArgumentMatchers.eq(java.util.UUID.fromString(PAYROLL_CASE)), org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of(new CaseFileService.CaseFileExport(java.util.Map.of(), "<html></html>")));

        String benUrl = "/v1/cases/" + BENEFICIARY_CASE + "/export";
        mvc.perform(get(benUrl)).andExpect(status().isUnauthorized());
        mvc.perform(get(benUrl).with(as("SCHEME_DEPT"))).andExpect(status().isOk());
        mvc.perform(get(benUrl).with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());

        String payUrl = "/v1/cases/" + PAYROLL_CASE + "/export";
        mvc.perform(get(payUrl).with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
        mvc.perform(get(payUrl).with(as("DEPT_ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void theGuidedStoryNamesPeopleSoItIsNotForSeniorManagement() throws Exception {
        mvc.perform(get("/v1/story")).andExpect(status().isUnauthorized());
        for (String role : List.of("SCHEME_DEPT", "DEPT_ADMIN")) {
            mvc.perform(get("/v1/story").with(as(role))).andExpect(allowed());
        }
        mvc.perform(get("/v1/story").with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());
    }

    @Test
    void verifyingACaseClosedIsForOutcomeRolesOnly() throws Exception {
        String url = "/v1/cases/" + CASE + "/verify-closed";
        mvc.perform(post(url).contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        for (String role : List.of("DEPT_ADMIN", "FINANCE_OFFICER")) {
            mvc.perform(post(url).with(as(role)).contentType(JSON).content("{}")).andExpect(allowed());
        }
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN", "SENIOR_MGMT")) {
            mvc.perform(post(url).with(as(role)).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        }
    }

    @Test
    void detectionRunsAndMetricsAreForOperationsRoles() throws Exception {
        for (String role : List.of("IT_ADMIN", "DEPT_ADMIN")) {
            mvc.perform(post("/v1/admin/run-detection").with(as(role)).contentType(JSON).content("{}")).andExpect(allowed());
            mvc.perform(get("/v1/admin/metrics").with(as(role))).andExpect(allowed());
        }
        for (String role : List.of("REVENUE_OFFICER", "SCHEME_DEPT")) {
            mvc.perform(get("/v1/admin/metrics").with(as(role))).andExpect(status().isForbidden());
        }
    }

    @Test
    void thePaymentGateIsReadableByCaseReadersAndDecidedByFinance() throws Exception {
        mvc.perform(get("/v1/payment-gate/batches")).andExpect(status().isUnauthorized());
        for (String role : List.of("SCHEME_DEPT", "DEPT_ADMIN", "FINANCE_OFFICER")) {
            mvc.perform(get("/v1/payment-gate/batches").with(as(role))).andExpect(allowed());
        }
        mvc.perform(get("/v1/payment-gate/batches").with(as("TALATI"))).andExpect(status().isForbidden());
        String decision = "/v1/payment-gate/batches/" + CASE + "/lines/" + CASE + "/decision";
        for (String role : List.of("DEPT_ADMIN", "FINANCE_OFFICER")) {
            mvc.perform(post(decision).with(as(role)).contentType(JSON).content("{}")).andExpect(allowed());
        }
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(post(decision).with(as(role)).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        }
    }

    @Test
    void noticeDraftFollowsReviewRolesAndIssueFollowsActionRoles() throws Exception {
        when(noticeService.draft(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Map.of("text", "draft"));
        when(caseService.reopenOnAppeal(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.citizen.expenditure.entity.IntegrityCase());
        when(noticeService.issue(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new org.citizen.expenditure.entity.CaseNotice());
        String draft = "/v1/cases/" + CASE + "/notice";
        mvc.perform(get(draft)).andExpect(status().isUnauthorized());
        mvc.perform(get(draft).with(as("SCHEME_DEPT"))).andExpect(status().isOk());
        mvc.perform(get(draft).with(as("FINANCE_OFFICER"))).andExpect(status().isForbidden());
        String issue = draft + "/issue";
        mvc.perform(post(issue).with(as("DEPT_ADMIN")).contentType(JSON).content("{}")).andExpect(status().isOk());
        mvc.perform(post(issue).with(as("SCHEME_DEPT")).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        String reopen = "/v1/cases/" + CASE + "/reopen";
        mvc.perform(post(reopen).with(as("DEPT_ADMIN")).contentType(JSON).content("{\"reason\":\"appeal\"}")).andExpect(status().isOk());
        mvc.perform(post(reopen).with(as("FINANCE_OFFICER")).contentType(JSON).content("{\"reason\":\"appeal\"}")).andExpect(status().isForbidden());
    }

    @Test
    void theMoneyOverviewIsOpenToSeniorManagementButNotToPayrollOnlyRoles() throws Exception {
        mvc.perform(get("/v1/overview")).andExpect(status().isUnauthorized());
        for (String role : List.of("SENIOR_MGMT", "DEPT_ADMIN", "SCHEME_DEPT", "FINANCE_OFFICER")) {
            mvc.perform(get("/v1/overview").with(as(role))).andExpect(allowed());
        }
        for (String role : List.of("HR_OFFICER", "TALATI")) {
            mvc.perform(get("/v1/overview").with(as(role))).andExpect(status().isForbidden());
        }
        // senior management sees the totals, not the cases
        mvc.perform(get("/v1/alerts").with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());
    }

    @Test
    void theLegacyScreenFollowsSchemeEnginesRoleList() throws Exception {
        mvc.perform(get("/v1/admin/fraud-signals")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("REVENUE_OFFICER"))).andExpect(allowed());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("DEPT_ADMIN"))).andExpect(allowed());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("IT_ADMIN"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
    }

    // ---- CSV import endpoints ------------------------------------------------------------------------------

    private static org.springframework.mock.web.MockMultipartFile csvFile(String text) {
        return new org.springframework.mock.web.MockMultipartFile("file", "data.csv", "text/csv", text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void importsAreForOperationsRolesOnly() throws Exception {
        when(importService.importUnitsCsv(org.mockito.ArgumentMatchers.any())).thenReturn(new ImportService.ImportResult(3, 1));
        when(importService.importSettlementsCsv(org.mockito.ArgumentMatchers.any())).thenReturn(new ImportService.ImportResult(3, 1));
        when(importService.importLifeCertificatesCsv(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(new ImportService.ImportResult(3, 1));
        when(importService.importVerificationEventsCsv(org.mockito.ArgumentMatchers.any())).thenReturn(new ImportService.ImportResult(3, 1, 0, 2));
        var payrollAnswer = new ImportService.ImportResult(3, 1, 2);
        when(payrollImportService.importEmployees(org.mockito.ArgumentMatchers.any())).thenReturn(payrollAnswer);
        when(payrollImportService.importServiceEvents(org.mockito.ArgumentMatchers.any())).thenReturn(payrollAnswer);
        when(payrollImportService.importPayroll(org.mockito.ArgumentMatchers.any())).thenReturn(payrollAnswer);
        when(payrollImportService.importPensions(org.mockito.ArgumentMatchers.any())).thenReturn(payrollAnswer);
        for (String path : List.of("units", "settlements", "verification-events", "life-certificates", "employees", "service-events", "payroll", "pensions")) {
            var upload = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/v1/admin/import/" + path);
            mvc.perform(upload.file(csvFile("a,b\n"))).andExpect(status().isUnauthorized());
            for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "TALATI")) {
                mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/v1/admin/import/" + path)
                        .file(csvFile("a,b\n")).with(as(role))).andExpect(status().isForbidden());
            }
            for (String role : List.of("IT_ADMIN", "DEPT_ADMIN")) {
                mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/v1/admin/import/" + path)
                        .file(csvFile("a,b\n")).with(as(role)))
                        .andExpect(status().isOk())
                        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.imported").value(3))
                        .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.skipped").value(1));
            }
        }
    }

    @Test
    void aRefusedFileAnswers400WithTheLineAndTheReason() throws Exception {
        when(importService.importSettlementsCsv(org.mockito.ArgumentMatchers.any()))
                .thenThrow(new CsvImportException(7, "amount 'lots' is not a number"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/v1/admin/import/settlements")
                        .file(csvFile("x\n")).with(as("DEPT_ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.line").value(7))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message").value("Line 7: amount 'lots' is not a number"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.imported").value(0));
    }

    @Test
    void uploadingNoFileIsABadRequest() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/v1/admin/import/units").with(as("DEPT_ADMIN")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verificationEventsLastLoadedIsForAdminRolesOnly() throws Exception {
        var loaded = new org.citizen.expenditure.entity.VerificationEvent();
        loaded.setCreatedAt(java.time.LocalDateTime.of(2026, 10, 1, 12, 0));
        when(verificationEventRepo.findFirstByCreatedAtIsNotNullOrderByCreatedAtDesc())
                .thenReturn(java.util.Optional.of(loaded));
        mvc.perform(get("/v1/admin/import/verification-events/last")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/import/verification-events/last").with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/import/verification-events/last").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/import/verification-events/last").with(as("IT_ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void whatIfIsForDepartmentAndItAdminsOnly() throws Exception {
        when(whatIfService.defaults()).thenReturn(java.util.Map.of("rule804MinUnits", 4));
        mvc.perform(get("/v1/admin/what-if/defaults")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/what-if/defaults").with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/what-if/defaults").with(as("REVENUE_OFFICER"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/what-if/defaults").with(as("SENIOR_MGMT"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/what-if/defaults").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/what-if/defaults").with(as("IT_ADMIN"))).andExpect(status().isOk());

        when(whatIfService.run(org.mockito.ArgumentMatchers.any())).thenReturn(
                new WhatIfService.WhatIfResponse(java.util.List.of(), java.util.List.of(), "note"));
        mvc.perform(post("/v1/admin/what-if").contentType(JSON).content("{}").with(as("SCHEME_DEPT")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/v1/admin/what-if").contentType(JSON).content("{}").with(as("DEPT_ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void dataReadinessIsForAdminRolesOnly() throws Exception {
        when(readinessService.readiness()).thenReturn(java.util.Map.of("feeds", java.util.List.of()));
        mvc.perform(get("/v1/admin/readiness")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/readiness").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/readiness").with(as("IT_ADMIN"))).andExpect(status().isOk());
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "SENIOR_MGMT")) {
            mvc.perform(get("/v1/admin/readiness").with(as(role))).andExpect(status().isForbidden());
        }
    }

    // ---- payroll cases carry salaries: open only to payroll and finance roles ------------------------------

    private static final String PAYROLL_CASE = "33333333-3333-3333-3333-333333333333";
    private static final String BENEFICIARY_CASE = "44444444-4444-4444-4444-444444444444";

    private void knownCases() {
        when(caseService.domainOf(java.util.UUID.fromString(PAYROLL_CASE))).thenReturn(java.util.Optional.of(org.citizen.expenditure.domain.IntegrityDomain.PAYROLL));
        when(caseService.domainOf(java.util.UUID.fromString(BENEFICIARY_CASE))).thenReturn(java.util.Optional.of(org.citizen.expenditure.domain.IntegrityDomain.BENEFICIARY));
    }

    @Test
    void payrollAlertsAreHiddenFromSchemeOfficersAndItAdmins() throws Exception {
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(get("/v1/alerts?domain=PAYROLL").with(as(role))).andExpect(status().isForbidden());
        }
        for (String role : List.of("DEPT_ADMIN", "PAYROLL_REVIEWER", "FINANCE_OFFICER", "HR_OFFICER")) {
            mvc.perform(get("/v1/alerts?domain=PAYROLL").with(as(role))).andExpect(allowed());
        }
        for (String role : List.of("PAYROLL_REVIEWER", "HR_OFFICER")) {
            mvc.perform(get("/v1/alerts?domain=BENEFICIARY").with(as(role))).andExpect(status().isForbidden());
        }
    }

    @Test
    void anUnfilteredAlertListLeavesOutThePayrollAlertsTheCallerMayNotSee() throws Exception {
        var beneficiary = new org.citizen.expenditure.entity.IntegrityAlert();
        beneficiary.setDomain(org.citizen.expenditure.domain.IntegrityDomain.BENEFICIARY);
        beneficiary.setRuleCode("802");
        var payroll = new org.citizen.expenditure.entity.IntegrityAlert();
        payroll.setDomain(org.citizen.expenditure.domain.IntegrityDomain.PAYROLL);
        payroll.setRuleCode("S01");
        when(caseService.listAlerts(null, null, "OPEN", null, null, null, null, null, null, null)).thenReturn(List.of(beneficiary, payroll));
        var json = org.springframework.test.web.servlet.result.MockMvcResultMatchers.class;
        mvc.perform(get("/v1/alerts").with(as("SCHEME_DEPT")))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.length()").value(1))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$[0].ruleCode").value("802"));
        mvc.perform(get("/v1/alerts").with(as("DEPT_ADMIN")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.length()").value(2));
    }

    @Test
    void aPayrollCaseCannotBeOpenedByARoleThatIsNotInPayroll() throws Exception {
        knownCases();
        for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "IT_ADMIN")) {
            mvc.perform(get("/v1/cases/" + PAYROLL_CASE).with(as(role))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/v1/cases/" + PAYROLL_CASE).with(as("DEPT_ADMIN"))).andExpect(allowed());
        mvc.perform(get("/v1/cases/" + PAYROLL_CASE).with(as("HR_OFFICER"))).andExpect(allowed());
        mvc.perform(get("/v1/cases/" + BENEFICIARY_CASE).with(as("SCHEME_DEPT"))).andExpect(allowed());
    }

    @Test
    void decidingAPayrollCaseIsForPayrollReviewers_andABeneficiaryCaseForSchemeReviewers() throws Exception {
        knownCases();
        for (String path : List.of("assign", "decision")) {
            for (String role : List.of("SCHEME_DEPT", "REVENUE_OFFICER", "HR_OFFICER", "FINANCE_OFFICER")) {
                mvc.perform(post("/v1/cases/" + PAYROLL_CASE + "/" + path).with(as(role)).contentType(JSON).content("{}"))
                        .andExpect(status().isForbidden());
            }
            for (String role : List.of("DEPT_ADMIN", "PAYROLL_REVIEWER")) {
                mvc.perform(post("/v1/cases/" + PAYROLL_CASE + "/" + path).with(as(role)).contentType(JSON).content("{}")).andExpect(allowed());
            }
            // and the other way round: a payroll reviewer has no say on beneficiary payments
            mvc.perform(post("/v1/cases/" + BENEFICIARY_CASE + "/" + path).with(as("PAYROLL_REVIEWER")).contentType(JSON).content("{}"))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/v1/cases/" + BENEFICIARY_CASE + "/" + path).with(as("SCHEME_DEPT")).contentType(JSON).content("{}")).andExpect(allowed());
        }
    }

    @Test
    void financeOfficersRecordOutcomesInBothDomains_butPayrollReviewersAndHrDoNot() throws Exception {
        knownCases();
        for (String caseId : List.of(PAYROLL_CASE, BENEFICIARY_CASE)) {
            mvc.perform(post("/v1/cases/" + caseId + "/actions").with(as("FINANCE_OFFICER")).contentType(JSON).content("{}")).andExpect(allowed());
            mvc.perform(post("/v1/cases/" + caseId + "/actions").with(as("DEPT_ADMIN")).contentType(JSON).content("{}")).andExpect(allowed());
            for (String role : List.of("PAYROLL_REVIEWER", "HR_OFFICER", "SCHEME_DEPT")) {
                mvc.perform(post("/v1/cases/" + caseId + "/actions").with(as(role)).contentType(JSON).content("{}")).andExpect(status().isForbidden());
            }
        }
    }

    // ---- refusals say why ----------------------------------------------------------------------------------

    @Test
    void aRefusedWorkflowStepAnswersWithTheStatusAndAMessageThePortalCanShow() throws Exception {
        java.util.UUID id = java.util.UUID.fromString(BENEFICIARY_CASE);
        when(caseService.recordDecision(org.mockito.ArgumentMatchers.eq(id), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "A reason is required."));
        when(caseService.recordAction(org.mockito.ArgumentMatchers.eq(id), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Record a decision on this case before recording an outcome."));
        mvc.perform(post("/v1/cases/" + BENEFICIARY_CASE + "/decision").with(as("SCHEME_DEPT")).contentType(JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message").value("A reason is required."));
        mvc.perform(post("/v1/cases/" + BENEFICIARY_CASE + "/actions").with(as("DEPT_ADMIN")).contentType(JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message").value("Record a decision on this case before recording an outcome."));
    }

    @Test
    void aRoleThatIsRefusedAPayrollCaseIsToldWhy() throws Exception {
        knownCases();
        mvc.perform(get("/v1/cases/" + PAYROLL_CASE).with(as("SCHEME_DEPT")))
                .andExpect(status().isForbidden())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message").value(org.hamcrest.Matchers.containsString("payroll and finance roles")));
    }
}
