package org.citizen.marriage.workflow;

import com.fasterxml.jackson.databind.JsonNode;
import org.citizen.marriage.config.WorkflowProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class WorkflowClient {

    private final RestClient restClient;
    private final WorkflowProperties props;

    public WorkflowClient(RestClient restClient, WorkflowProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    public JsonNode apply(String businessId) {
        return transition(businessId, "APPLY", citizenRequestInfo());
    }

    public JsonNode approve(String businessId) {
        return transition(businessId, "APPROVE", officerRequestInfo());
    }

    private JsonNode transition(String businessId, String action, Map<String, Object> requestInfo) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("RequestInfo", requestInfo);
        body.put("ProcessInstances", List.of(Map.of(
                "tenantId", props.tenantId(),
                "businessService", props.businessService(),
                "businessId", businessId,
                "moduleName", props.moduleName(),
                "action", action
        )));

        try {
            return restClient.post()
                    .uri(props.baseUrl() + "/egov-wf/process/_transition")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException ex) {
            throw new IllegalStateException("Workflow transition failed: " + ex.getResponseBodyAsString(), ex);
        }
    }

    private Map<String, Object> citizenRequestInfo() {
        return Map.of(
                "apiId", "marriage-certificate-service",
                "ver", ".01",
                "msgId", UUID.randomUUID().toString(),
                "authToken", "demo",
                "userInfo", Map.of(
                        "uuid", props.citizenUuid(),
                        "userName", props.citizenUsername(),
                        "name", props.citizenName(),
                        "type", "CITIZEN",
                        "tenantId", props.tenantId(),
                        "roles", List.of(Map.of("code", "CITIZEN", "tenantId", props.tenantId()))
                )
        );
    }

    private Map<String, Object> officerRequestInfo() {
        return Map.of(
                "apiId", "marriage-certificate-service",
                "ver", ".01",
                "msgId", UUID.randomUUID().toString(),
                "authToken", "demo",
                "userInfo", Map.of(
                        "uuid", props.officerUuid(),
                        "userName", "officer",
                        "name", props.officerName(),
                        "type", "EMPLOYEE",
                        "tenantId", props.tenantId(),
                        "roles", List.of(Map.of("code", "MARRIAGE_APPROVER", "tenantId", props.tenantId()))
                )
        );
    }
}
