package org.magicsword.family.event;

public record FamilyRegistryEvent(
        String eventType,
        String familyId,
        String personId,
        String timestamp
) {}
