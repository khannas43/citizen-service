package org.magicsword.marriage.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "egov.workflow")
public record WorkflowProperties(
        String baseUrl,
        String tenantId,
        String businessService,
        String moduleName,
        String citizenUuid,
        String citizenUsername,
        String citizenName,
        String officerUuid,
        String officerName
) {}
