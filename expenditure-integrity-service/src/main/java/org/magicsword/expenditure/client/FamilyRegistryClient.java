package org.magicsword.expenditure.client;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Resolves person display names from the family registry (source of truth for citizen names). */
@Component
public class FamilyRegistryClient {

    private final WebClient webClient;
    public FamilyRegistryClient(WebClient familyRegistryWebClient) {
        this.webClient = familyRegistryWebClient;
    }

    public record RegistryMember(String name, String aadhaarRef) {}

    public Optional<String> findPersonName(String personId, String familyId) {
        return findMember(personId, familyId).map(RegistryMember::name);
    }

    public Optional<String> findMaskedAadhaar(String personId, String familyId) {
        return findMember(personId, familyId)
                .map(RegistryMember::aadhaarRef)
                .map(FamilyRegistryClient::maskAadhaarRef);
    }

    public Optional<RegistryMember> findMember(String personId, String familyId) {
        if (personId == null || personId.isBlank() || familyId == null || familyId.isBlank()) {
            return Optional.empty();
        }
        String key = personId + "|" + familyId;
        return memberCache.computeIfAbsent(key, k -> lookupMember(personId, familyId));
    }

    private final ConcurrentHashMap<String, Optional<RegistryMember>> memberCache = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    private Optional<RegistryMember> lookupMember(String personId, String familyId) {
        UUID personUuid = parseUuid(personId).orElse(null);
        UUID familyUuid = parseUuid(familyId).orElse(null);
        if (personUuid == null || familyUuid == null) {
            return Optional.empty();
        }
        try {
            Map<String, Object> body = webClient.get()
                    .uri("/v1/families/{id}", familyUuid)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            if (body == null) {
                return Optional.empty();
            }
            Object membersObj = body.get("members");
            if (!(membersObj instanceof List<?> members)) {
                return Optional.empty();
            }
            for (Object m : members) {
                if (!(m instanceof Map<?, ?> map)) {
                    continue;
                }
                Object id = map.get("id");
                if (id == null || !personUuid.toString().equalsIgnoreCase(String.valueOf(id))) {
                    continue;
                }
                Object name = map.get("name");
                Object aadhaar = map.get("aadhaarRef");
                String personName = name != null ? String.valueOf(name).trim() : "";
                String aadhaarRef = aadhaar != null ? String.valueOf(aadhaar).trim() : null;
                if (personName.isBlank()) {
                    return Optional.empty();
                }
                return Optional.of(new RegistryMember(personName, aadhaarRef));
            }
        } catch (Exception ignored) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    /** e.g. XXXX-XXXX-5001 → ****-****-5001 */
    public static String maskAadhaarRef(String ref) {
        if (ref == null || ref.isBlank()) {
            return null;
        }
        String trimmed = ref.trim();
        if (trimmed.matches("(?i)^X{4}-X{4}-\\d{4}$")) {
            return "****-****-" + trimmed.substring(trimmed.length() - 4);
        }
        if (trimmed.length() <= 4) {
            return "****";
        }
        return "****" + trimmed.substring(trimmed.length() - 4);
    }

    private static Optional<UUID> parseUuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(UUID.fromString(raw.trim()));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
