package org.citizen.family.model;

import java.util.List;
import java.util.UUID;

public record FamilyResponse(
        UUID id,
        String address,
        String village,
        String taluka,
        String district,
        String state,
        String rationCardNumber,
        List<PersonSummary> members
) {}
