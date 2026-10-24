package org.magicsword.auth.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PersonSummary(
        UUID id,
        UUID familyId,
        String name,
        String mobile,
        String aadhaarRef
) {}
