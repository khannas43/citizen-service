package org.citizen.family.event;

public record FamilyRegistryEvent(
        String eventType,
        String familyId,
        String personId,
        String timestamp
) {}
