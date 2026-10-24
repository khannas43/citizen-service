package org.magicsword.formdefinition;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * FB-E1.1 fail-closed auth-order: unauthenticated callers always receive {@code
 * governance_unauthenticated} before If-Match, body, pagination, or coordinate admission.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers
class FormDefinitionGovernanceFailClosedIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("egov_db")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    private static final String GOV_QUEUE = "/api/v1/form-definitions/governance/queue";
    private static final String GOV_DETAIL = "/api/v1/form-definitions/governance/detail";
    private static final String GOV_LIFECYCLE =
            "/api/v1/form-definitions/governance/lifecycle-transitions";

    @Test
    void defaultProviderReturns401OnGovernanceQueue() throws Exception {
        MvcResult result =
                mockMvc.perform(get(GOV_QUEUE))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andExpect(jsonPath("$.actorId").doesNotExist())
                        .andExpect(jsonPath("$.capabilities").doesNotExist())
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    @Test
    void unauthenticatedQueueWithInvalidPaginationStill401() throws Exception {
        MvcResult result =
                mockMvc.perform(get(GOV_QUEUE).param("afterServiceId", "only-one-half"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    @Test
    void unauthenticatedDetailWithInvalidCoordinatesStill401() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                get(GOV_DETAIL)
                                        .param("serviceId", "svc")
                                        .param("version", "0"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    @Test
    void unauthenticatedLifecycleMissingIfMatchReturns401Not428() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", "svc")
                                        .param("version", "1")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"targetStatus\":\"approved\"}"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    @Test
    void unauthenticatedLifecycleInvalidBodyWithActorIdReturns401Not400() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", "svc")
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, "\"etag\"")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"targetStatus\":\"approved\",\"actorId\":\"spoofed\"}"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    @Test
    void unauthenticatedLifecycleWellFormedButWrongTargetStill401() throws Exception {
        MvcResult result =
                mockMvc.perform(
                                post(GOV_LIFECYCLE)
                                        .param("serviceId", "svc")
                                        .param("version", "1")
                                        .header(HttpHeaders.IF_MATCH, "\"etag\"")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"targetStatus\":\"submitted\"}"))
                        .andExpect(status().isUnauthorized())
                        .andExpect(jsonPath("$.code").value("governance_unauthenticated"))
                        .andReturn();
        assertNoPrincipalLeak(result);
    }

    private static void assertNoPrincipalLeak(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("actorId")
                .doesNotContain("capabilities")
                .doesNotContain("APPROVE_FORM_DEFINITION")
                .doesNotContain("PUBLISH_FORM_DEFINITION")
                .doesNotContain("Bearer")
                .doesNotContain("token");
    }
}
