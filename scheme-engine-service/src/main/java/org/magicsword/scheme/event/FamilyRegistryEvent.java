package org.magicsword.scheme.event;

public record FamilyRegistryEvent(
        String eventType,
        String familyId,
        String personId,
        String timestamp
) {}
