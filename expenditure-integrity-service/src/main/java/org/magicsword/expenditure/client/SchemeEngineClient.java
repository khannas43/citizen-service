package org.magicsword.expenditure.client;

import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class SchemeEngineClient {

    private final WebClient webClient;

    public SchemeEngineClient(WebClient schemeEngineWebClient) {
        this.webClient = schemeEngineWebClient;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> guestEligibility(UUID schemeId, Map<String, Object> body) {
        try {
            return webClient.post()
                    .uri("/v1/eligibility/guest")
                    .bodyValue(buildGuestRequest(schemeId, body))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
        } catch (Exception e) {
            return Map.of("eligible", false, "error", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> publicDetails(UUID schemeId) {
        try {
            return webClient.get()
                    .uri("/v1/schemes/{id}/public-details", schemeId)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
        } catch (Exception e) {
            return Map.of();
        }
    }

    private Map<String, Object> buildGuestRequest(UUID schemeId, Map<String, Object> fields) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("annualIncome", fields.getOrDefault("annualIncome", 0));
        body.put("age", fields.getOrDefault("age", 18));
        if (fields.get("district") != null) body.put("district", fields.get("district"));
        if (fields.get("gender") != null) body.put("gender", fields.get("gender"));
        body.put("casteCategory", fields.getOrDefault("casteCategory", "GENERAL"));
        body.put("educationLevel", fields.getOrDefault("educationLevel", "HIGHER_SEC"));
        body.put("examType", fields.getOrDefault("examType", "STD12"));
        body.put("examPercentile", fields.getOrDefault("examPercentile", 75));
        body.put("courseCategory", fields.getOrDefault("courseCategory", "ENGINEERING_GROUP"));
        body.put("suppliedFields", java.util.List.of("annualIncome", "age", "examType", "examPercentile", "courseCategory"));
        body.put("_targetSchemeId", schemeId.toString());
        return body;
    }

    /**
     * The scheme's own income or age tests that fail for this person, as the engine words them ("Income ... (ceiling)").
     * Only these two are read: the unit carries no gender, caste or exam result, so a scheme that is refused for those
     * says nothing about the entitlement. Empty when the tests pass, or when the engine cannot be reached or does not
     * report the scheme (a failed call must never look like a finding).
     */
    public List<String> failedIncomeOrAgeTests(UUID schemeId, String district, int age, long income) {
        if (district == null || district.isBlank()) return List.of();
        Map<String, Object> answer = guestEligibility(schemeId,
                Map.of("annualIncome", income, "age", age, "district", district, "gender", "F"));
        List<String> failed = new java.util.ArrayList<>();
        if (answer == null || !(answer.get("matches") instanceof List<?> matches)) return failed;
        for (Object m : matches) {
            if (!(m instanceof Map<?, ?> map) || !schemeId.toString().equals(String.valueOf(map.get("schemeId")))) continue;
            if (!(map.get("reasons") instanceof List<?> reasons)) return failed;
            for (Object r : reasons) {
                if (!(r instanceof Map<?, ?> reason) || !Boolean.FALSE.equals(reason.get("passed"))) continue;
                String text = String.valueOf(reason.get("text"));
                if (text.startsWith("Income") || text.startsWith("Age")) failed.add(text);
            }
        }
        return failed;
    }

    /** True when the scheme's income test fails at {@code income}; the gender the engine asks for does not change it. */
    public boolean incomeBreachesScheme(UUID schemeId, String district, int age, long income) {
        return failedIncomeOrAgeTests(schemeId, district, age, income).stream().anyMatch(t -> t.startsWith("Income"));
    }

    @SuppressWarnings("unchecked")
    public boolean isEligibleForScheme(UUID schemeId, Map<String, Object> guestResponse) {
        if (guestResponse == null || guestResponse.isEmpty()) return true;
        Object matchesObj = guestResponse.get("matches");
        if (!(matchesObj instanceof List<?> matches)) return true;
        for (Object m : matches) {
            if (!(m instanceof Map<?, ?> map)) continue;
            Object id = map.get("schemeId");
            if (id != null && schemeId.toString().equals(String.valueOf(id))) {
                Object outcome = map.get("outcome");
                if ("NOT_ELIGIBLE".equals(String.valueOf(outcome))) return false;
                Object eligible = map.get("eligible");
                return eligible == null || Boolean.TRUE.equals(eligible);
            }
        }
        return true;
    }
}
