package org.citizen.scheme.event;

public record FamilyRegistryEvent(
        String eventType,
        String familyId,
        String personId,
        String timestamp
) {}
