package org.magicsword.scheme.security;

import org.junit.jupiter.api.Test;
import org.magicsword.scheme.controller.AdminController;
import org.magicsword.scheme.controller.BeneficiaryController;
import org.magicsword.scheme.controller.CustomRuleController;
import org.magicsword.scheme.repository.CustomRuleRepository;
import org.magicsword.scheme.service.OfficeImportService;
import org.magicsword.scheme.service.SchemeEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /v1/admin/** must be closed to anonymous callers and to roles that have no business there. */
@WebMvcTest({AdminController.class, BeneficiaryController.class, CustomRuleController.class})
@Import(OfficerSecurityConfig.class)
@TestPropertySource(properties = "internal.service-key=test-internal-key")
class AdminEndpointSecurityTest {

    @Autowired MockMvc mvc;
    @MockBean SchemeEngineService service;
    @MockBean OfficeImportService officeImportService;
    @MockBean CustomRuleRepository ruleRepository;

    private static RequestPostProcessor as(String role) {
        return jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
    }

    @Test
    void anonymousCallersAreRejectedOnEveryAdminEndpoint() throws Exception {
        mvc.perform(post("/v1/admin/run-identification")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/admin/backfill-geography")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/fraud-signals")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/admin/ops-summary")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/admin/trigger-birthday-check")).andExpect(status().isUnauthorized());
    }

    @Test
    void runIdentificationIsForSchemeDeptAndDeptAdminOnly() throws Exception {
        mvc.perform(post("/v1/admin/run-identification").with(as("SCHEME_DEPT"))).andExpect(status().isOk());
        mvc.perform(post("/v1/admin/run-identification").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(post("/v1/admin/run-identification").with(as("TALATI"))).andExpect(status().isForbidden());
        mvc.perform(post("/v1/admin/run-identification").with(as("IT_ADMIN"))).andExpect(status().isForbidden());
    }

    @Test
    void fraudSignalsAreForRevenueOfficerAndDeptAdminOnly() throws Exception {
        mvc.perform(get("/v1/admin/fraud-signals").with(as("REVENUE_OFFICER"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/fraud-signals").with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
    }

    @Test
    void operationsToolsAreForItAdminAndDeptAdminOnly() throws Exception {
        mvc.perform(get("/v1/admin/ops-summary").with(as("IT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(post("/v1/admin/trigger-birthday-check").with(as("DEPT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(post("/v1/admin/backfill-geography").with(as("IT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get("/v1/admin/ops-summary").with(as("REVENUE_OFFICER"))).andExpect(status().isForbidden());
        mvc.perform(post("/v1/admin/backfill-geography").with(as("SCHEME_DEPT"))).andExpect(status().isForbidden());
    }

    @Test
    void creatingEditingAndDeactivatingSchemesNeedsSchemeDeptOrDeptAdmin() throws Exception {
        mvc.perform(post("/v1/schemes")).andExpect(status().isUnauthorized());
        mvc.perform(put("/v1/schemes/abc")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/v1/schemes/abc")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/v1/schemes/abc").with(as("TALATI"))).andExpect(status().isForbidden());
        mvc.perform(delete("/v1/schemes/abc").with(as("IT_ADMIN"))).andExpect(status().isForbidden());
        mvc.perform(put("/v1/schemes/abc").with(as("REVENUE_OFFICER"))).andExpect(status().isForbidden());
        // allowed roles get past security (no controller in this slice, so the answer is 404, not 401/403)
        mvc.perform(delete("/v1/schemes/abc").with(as("SCHEME_DEPT"))).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/schemes/abc").with(as("DEPT_ADMIN"))).andExpect(status().isNotFound());
        // the simulator and all reads stay public
        mvc.perform(post("/v1/schemes/simulate")).andExpect(status().isNotFound());
        mvc.perform(get("/v1/schemes/abc")).andExpect(status().isNotFound());
    }

    private static final String JSON = "application/json";

    /** Security lets the request through: whatever the controller then answers, it is not 401/403. */
    private static org.springframework.test.web.servlet.ResultMatcher passesSecurity() {
        return result -> org.junit.jupiter.api.Assertions.assertFalse(
                result.getResponse().getStatus() == 401 || result.getResponse().getStatus() == 403,
                "blocked by security: HTTP " + result.getResponse().getStatus());
    }

    @Test
    void beneficiaryDecisionsAreForSchemeManagersOnly() throws Exception {
        String id = "11111111-1111-1111-1111-111111111111";
        // anonymous
        mvc.perform(post("/v1/beneficiaries/" + id + "/confirm").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/beneficiaries/" + id + "/remove").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/v1/beneficiaries/" + id + "/disburse").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/v1/beneficiaries/" + id + "/override").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/beneficiaries/bulk/confirm").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/v1/beneficiaries/bulk/override").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/beneficiaries/confirm-application").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        // wrong roles
        mvc.perform(post("/v1/beneficiaries/" + id + "/remove").with(as("TALATI")).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(patch("/v1/beneficiaries/" + id + "/disburse").with(as("IT_ADMIN")).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(post("/v1/beneficiaries/bulk/confirm").with(as("REVENUE_OFFICER")).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        // scheme managers
        mvc.perform(post("/v1/beneficiaries/" + id + "/remove").with(as("SCHEME_DEPT")).contentType(JSON).content("{}")).andExpect(passesSecurity());
        mvc.perform(patch("/v1/beneficiaries/" + id + "/override").with(as("DEPT_ADMIN")).contentType(JSON).content("{}")).andExpect(passesSecurity());
        mvc.perform(post("/v1/beneficiaries/bulk/confirm").with(as("SCHEME_DEPT")).contentType(JSON).content("{}")).andExpect(passesSecurity());
        // reads stay open
        mvc.perform(get("/v1/beneficiaries/dashboard/summary")).andExpect(passesSecurity());
    }

    @Test
    void anotherServiceMayOnlyConfirmWithTheSharedKey() throws Exception {
        String id = "11111111-1111-1111-1111-111111111111";
        mvc.perform(post("/v1/beneficiaries/confirm-application").header("X-Internal-Key", "test-internal-key")
                .contentType(JSON).content("{}")).andExpect(passesSecurity());
        mvc.perform(post("/v1/beneficiaries/" + id + "/confirm").header("X-Internal-Key", "test-internal-key")
                .contentType(JSON).content("{}")).andExpect(passesSecurity());
        // wrong key: no access
        mvc.perform(post("/v1/beneficiaries/confirm-application").header("X-Internal-Key", "wrong")
                .contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        // the key opens nothing else
        mvc.perform(post("/v1/beneficiaries/" + id + "/remove").header("X-Internal-Key", "test-internal-key")
                .contentType(JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(post("/v1/beneficiaries/bulk/confirm").header("X-Internal-Key", "test-internal-key")
                .contentType(JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(delete("/v1/schemes/abc").header("X-Internal-Key", "test-internal-key")).andExpect(status().isForbidden());
        mvc.perform(get("/v1/admin/ops-summary").header("X-Internal-Key", "test-internal-key")).andExpect(status().isForbidden());
    }

    @Test
    void savedRulesCanOnlyBeCreatedAndDeletedBySchemeManagers() throws Exception {
        String id = "22222222-2222-2222-2222-222222222222";
        org.mockito.Mockito.when(ruleRepository.save(org.mockito.ArgumentMatchers.any())).thenAnswer(i -> i.getArgument(0));
        mvc.perform(post("/v1/rules").contentType(JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/v1/rules/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/rules").with(as("TALATI")).contentType(JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(delete("/v1/rules/" + id).with(as("REVENUE_OFFICER"))).andExpect(status().isForbidden());
        mvc.perform(post("/v1/rules").with(as("SCHEME_DEPT")).contentType(JSON).content("{}")).andExpect(passesSecurity());
        mvc.perform(get("/v1/rules")).andExpect(passesSecurity());
    }

    @Test
    void publicEndpointsStayOpen() throws Exception {
        // not under /v1/admin: the citizen portal's guest eligibility check must keep working without a token
        mvc.perform(get("/v1/schemes")).andExpect(status().is(org.hamcrest.Matchers.not(401)));
    }
}
