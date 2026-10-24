package org.magicsword.chatbot.service;

import org.magicsword.chatbot.IntentDetector;
import org.magicsword.chatbot.Msgs;
import org.magicsword.chatbot.model.ChatRequest;
import org.magicsword.chatbot.model.ChatResponse;
import org.magicsword.chatbot.model.ChatSession;
import org.magicsword.chatbot.util.AppRefNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ChatbotService {

    private static final Logger log = LoggerFactory.getLogger(ChatbotService.class);
    private static final Set<String> VALID_CASTES = Set.of("SC", "ST", "OBC", "NT", "GENERAL");

    private final ConcurrentHashMap<String, ChatSession> sessions = new ConcurrentHashMap<>();
    private final WebClient webClient;

    @Value("${caste.cert.base-url}")
    private String casteCertUrl;

    @Value("${family.registry.base-url}")
    private String familyRegistryUrl;

    @Value("${scheme.engine.base-url}")
    private String schemeEngineUrl;

    @Value("${session.timeout-minutes:10}")
    private int timeoutMinutes;

    public ChatbotService(WebClient.Builder builder) {
        this.webClient = builder.build();
    }

    private String pensionUrl() {
        return casteCertUrl.replace("caste-certificate-service", "pension-service");
    }

    public ChatResponse chat(ChatRequest req) {
        String sid = req.sessionId() != null ? req.sessionId() : UUID.randomUUID().toString();
        String lang = "gu".equals(req.language()) ? "gu" : "en";
        ChatSession session = sessions.getOrDefault(sid,
                new ChatSession(sid, null, new HashMap<>(), null, Instant.now()));
        if (req.aadhaarRef() != null && !req.aadhaarRef().isBlank() && session.aadhaarRef() == null) {
            session = session.withAadhaar(req.aadhaarRef());
            sessions.put(sid, session);
        }

        String reply = processMessage(session, req.message(), sid, lang);
        ChatSession updated = sessions.getOrDefault(sid, session);
        String navigateTo = resolveNavigateTo(req.message(), reply);
        return new ChatResponse(reply, sid, updated.currentIntent(), navigateTo);
    }

    private static String resolveNavigateTo(String input, String reply) {
        if (reply == null || reply.isBlank()) {
            return null;
        }
        String intent = IntentDetector.detect(input);
        String fromIntent = switch (intent) {
            case "VIEW_CERTIFICATES" -> "/certificates";
            case "PAYMENTS" -> "/payments";
            case "FILE_GRIEVANCE" -> "/grievances";
            case "APPLY_SCHEME" -> "/apply/caf";
            default -> null;
        };
        if (fromIntent != null) {
            return fromIntent;
        }
        String lower = reply.toLowerCase();
        if (lower.contains("certificates section") || lower.contains("my certificates page")
                || lower.contains("certificates page") || lower.contains("મારા પ્રમાણપત્ર")) {
            return "/certificates";
        }
        if (lower.contains("payments & benefits") || lower.contains("payments page")
                || lower.contains("ચૂકવણી અને લાભ")) {
            return "/payments";
        }
        if (lower.contains("grievances page") || lower.contains("ફરિયાદ / ગ્રીવન્સ")) {
            return "/grievances";
        }
        if (lower.contains("common application form") || lower.contains("caf")) {
            return "/apply/caf";
        }
        return null;
    }

    private static final java.util.regex.Pattern REF_PATTERN =
            java.util.regex.Pattern.compile("^(CAS|PEN|MAR|FAM|SCH|GRV)-\\d{4}-\\d+$");

    private String processMessage(ChatSession session, String input, String sid, String lang) {
        if (session.currentIntent() == null) {
            String intent = IntentDetector.detect(input);
            session = session.withIntent(intent);
            sessions.put(sid, session);
            return startIntent(intent, session, input, sid, lang);
        }
        return continueIntent(session, input, sid, lang);
    }

    private String startIntent(String intent, ChatSession session, String input, String sid, String lang) {
        return switch (intent) {
            case "APPLY_CASTE" -> {
                if (session.aadhaarRef() != null && !session.aadhaarRef().isBlank()) {
                    String name = lookupName(session.aadhaarRef());
                    ChatSession pre = sessions.getOrDefault(sid, session)
                            .withField("applicantName", name)
                            .withField("aadhaarRef", session.aadhaarRef());
                    sessions.put(sid, pre);
                    yield Msgs.get(Msgs.CASTE_START_PREFILLED, lang, name);
                }
                yield Msgs.get(Msgs.CASTE_START, lang);
            }
            case "APPLY_PENSION" -> {
                if (session.aadhaarRef() != null && !session.aadhaarRef().isBlank()) {
                    ChatSession pre = sessions.getOrDefault(sid, session)
                            .withField("aadhaarRef", session.aadhaarRef());
                    sessions.put(sid, pre);
                }
                yield Msgs.get(Msgs.PENSION_START, lang);
            }
            case "CHECK_STATUS" -> {
                // If the message itself is a reference number, look it up directly
                String trimmed = normalizeRef(input);
                if (REF_PATTERN.matcher(trimmed).matches()
                        || trimmed.startsWith("FLW-") || trimmed.startsWith("DGT-")) {
                    sessions.put(sid, session.cleared());
                    yield lookupSingleApplication(trimmed, session, lang);
                }
                // Logged-in: list all their applications automatically
                if (session.aadhaarRef() != null && !session.aadhaarRef().isBlank()) {
                    sessions.put(sid, session.cleared());
                    yield fetchAllApplicationsText(session.aadhaarRef(), lang);
                }
                yield Msgs.get(Msgs.STATUS_START, lang);
            }
            case "ELIGIBILITY" -> {
                // Logged-in: fetch eligibility without asking for Aadhaar
                if (session.aadhaarRef() != null && !session.aadhaarRef().isBlank()) {
                    sessions.put(sid, session.cleared());
                    yield performEligibilityLookup(session.aadhaarRef(), lang);
                }
                yield Msgs.get(Msgs.ELIGIBILITY_START, lang);
            }
            case "PAYMENTS" -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.PAYMENTS_REDIRECT, lang);
            }
            case "VIEW_CERTIFICATES" -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.CERTIFICATES_REDIRECT, lang);
            }
            case "FILE_GRIEVANCE" -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.GRIEVANCES_REDIRECT, lang);
            }
            case "APPLY_SCHEME" -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.APPLY_SCHEME_REDIRECT, lang);
            }
            case "APPLY_MENU" -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.APPLY_MENU, lang);
            }
            default -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.WELCOME, lang);
            }
        };
    }

    private String continueIntent(ChatSession session, String input, String sid, String lang) {
        return switch (session.currentIntent()) {
            case "APPLY_CASTE" -> handleApplyCaste(session, input, sid, lang);
            case "APPLY_PENSION" -> handleApplyPension(session, input, sid, lang);
            case "CHECK_STATUS" -> handleCheckStatus(session, input, sid, lang);
            case "ELIGIBILITY" -> handleEligibility(session, input, sid, lang);
            default -> {
                sessions.put(sid, session.cleared());
                yield Msgs.get(Msgs.FALLBACK, lang);
            }
        };
    }

    private String handleApplyCaste(ChatSession session, String input, String sid, String lang) {
        Map<String, String> c = session.collected();
        if (!c.containsKey("applicantName")) {
            sessions.put(sid, session.withField("applicantName", input.trim()));
            return Msgs.get(Msgs.ASK_CASTE_CODE, lang);
        }
        if (!c.containsKey("casteCode")) {
            String caste = input.trim().toUpperCase();
            if (!VALID_CASTES.contains(caste)) {
                return Msgs.get(Msgs.INVALID_CASTE, lang);
            }
            if (c.containsKey("aadhaarRef")) {
                Map<String, String> final_ = new HashMap<>(c);
                final_.put("casteCode", caste);
                sessions.put(sid, session.cleared());
                return submitCasteCert(final_, lang);
            }
            sessions.put(sid, session.withField("casteCode", caste));
            return Msgs.get(Msgs.ASK_AADHAAR, lang);
        }
        if (!c.containsKey("aadhaarRef")) {
            session = session.withField("aadhaarRef", input.trim());
            sessions.put(sid, session.cleared());
            return submitCasteCert(session.collected(), lang);
        }
        sessions.put(sid, session.cleared());
        return Msgs.get(Msgs.FALLBACK, lang);
    }

    private String submitCasteCert(Map<String, String> c, String lang) {
        try {
            var body = Map.of(
                    "applicantName", c.getOrDefault("applicantName", "Citizen"),
                    "casteCode", c.getOrDefault("casteCode", "OBC"),
                    "aadhaarRef", c.getOrDefault("aadhaarRef", ""),
                    "tenantId", "pg"
            );
            @SuppressWarnings("unchecked")
            var res = (Map<String, Object>) webClient.post()
                    .uri(casteCertUrl + "/v1/applications")
                    .header("Content-Type", "application/json")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            String appNo = res != null && res.get("applicationNo") != null
                    ? String.valueOf(res.get("applicationNo"))
                    : (res != null ? String.valueOf(res.get("engineRef")) : "N/A");
            return Msgs.get(Msgs.CASTE_SUCCESS, lang, appNo);
        } catch (Exception e) {
            WebClientResponseException wcre = asWebClientResponseException(e);
            if (wcre != null && wcre.getStatusCode().value() == 409) {
                return mapCasteDuplicateError(extractApiError(wcre), lang);
            }
            if (wcre != null) {
                log.error("Caste cert submission failed: HTTP {} {}", wcre.getStatusCode(), wcre.getResponseBodyAsString());
            } else {
                log.error("Caste cert submission failed: {}", e.getMessage());
            }
            return Msgs.get(Msgs.SUBMIT_ERROR, lang);
        }
    }

    private static WebClientResponseException asWebClientResponseException(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof WebClientResponseException wcre) {
                return wcre;
            }
        }
        return null;
    }

    private static String extractApiError(WebClientResponseException ex) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = ex.getResponseBodyAs(Map.class);
            if (body != null && body.get("error") != null) {
                return String.valueOf(body.get("error"));
            }
        } catch (Exception ignored) {
            // fall through to raw body
        }
        return ex.getResponseBodyAsString();
    }

    private static String mapCasteDuplicateError(String apiError, String lang) {
        if (apiError == null) {
            apiError = "";
        }
        String lower = apiError.toLowerCase();
        String ref = "";
        int colon = apiError.lastIndexOf(':');
        if (colon >= 0 && colon + 1 < apiError.length()) {
            ref = apiError.substring(colon + 1).trim();
        }
        if (ref.isBlank()) {
            ref = "see My Applications";
        }
        if (lower.contains("already issued")) {
            return Msgs.get(Msgs.CASTE_ALREADY_ISSUED, lang, ref);
        }
        if (lower.contains("already in progress")) {
            return Msgs.get(Msgs.CASTE_ALREADY_PENDING, lang, ref);
        }
        return Msgs.get(Msgs.SUBMIT_ERROR, lang);
    }

    private String handleApplyPension(ChatSession session, String input, String sid, String lang) {
        Map<String, String> c = session.collected();
        if (!c.containsKey("pensionType")) {
            session = session.withField("pensionType", normalizePensionType(input.trim()));
            // If aadhaarRef already known, look up name and submit without asking
            if (session.aadhaarRef() != null && !session.aadhaarRef().isBlank()) {
                session = session.withField("aadhaarRef", session.aadhaarRef());
                String name = lookupName(session.aadhaarRef());
                session = session.withField("applicantName", name);
                sessions.put(sid, session.cleared());
                return submitPension(session.collected(), lang);
            }
            sessions.put(sid, session);
            return Msgs.get(Msgs.ASK_AADHAAR_PENSION, lang);
        }
        if (!c.containsKey("aadhaarRef")) {
            sessions.put(sid, session.withField("aadhaarRef", input.trim()));
            return Msgs.get(Msgs.ASK_NAME, lang);
        }
        if (!c.containsKey("applicantName")) {
            session = session.withField("applicantName", input.trim());
            sessions.put(sid, session.cleared());
            return submitPension(session.collected(), lang);
        }
        sessions.put(sid, session.cleared());
        return Msgs.get(Msgs.FALLBACK, lang);
    }

    private static String normalizePensionType(String input) {
        String lower = input.toLowerCase();
        if (lower.contains("widow") || lower.contains("વિધવ")) {
            return "WIDOW";
        }
        if (lower.contains("disab") || lower.contains("વિકલ")) {
            return "DISABILITY";
        }
        return "OLD_AGE";
    }

    private String submitPension(Map<String, String> c, String lang) {
        try {
            var body = new HashMap<String, Object>();
            body.put("applicantName", c.getOrDefault("applicantName", "Citizen"));
            body.put("pensionType", c.getOrDefault("pensionType", "OLD_AGE"));
            body.put("aadhaarRef", c.getOrDefault("aadhaarRef", ""));
            body.put("familyId", "");
            body.put("tenantId", "pg");

            @SuppressWarnings("unchecked")
            var res = (Map<String, Object>) webClient.post()
                    .uri(pensionUrl() + "/v1/applications")
                    .header("Content-Type", "application/json")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            String appNo = res != null && res.get("applicationNo") != null
                    ? String.valueOf(res.get("applicationNo"))
                    : (res != null ? String.valueOf(res.get("engineRef")) : "N/A");
            return Msgs.get(Msgs.PENSION_SUCCESS, lang, appNo);
        } catch (Exception e) {
            log.error("Pension submission failed: {}", e.getMessage());
            return Msgs.get(Msgs.SUBMIT_ERROR, lang);
        }
    }

    private String lookupName(String aadhaarRef) {
        try {
            List<Map<String, Object>> persons = searchPersonsByAadhaar(aadhaarRef);
            for (Map<String, Object> p : persons) {
                if (aadhaarRef.equals(String.valueOf(p.get("aadhaarRef")))) {
                    return String.valueOf(p.getOrDefault("name", "Citizen"));
                }
            }
            if (!persons.isEmpty()) {
                return String.valueOf(persons.get(0).getOrDefault("name", "Citizen"));
            }
        } catch (Exception e) {
            log.warn("Name lookup failed for {}: {}", aadhaarRef, e.getMessage());
        }
        return "Citizen";
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> searchPersonsByAadhaar(String aadhaarRef) {
        Map<String, Object> response = webClient.get()
                .uri(familyRegistryUrl + "/v1/persons/search?aadhaar=" + aadhaarRef)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
        if (response == null) {
            return List.of();
        }
        Object results = response.get("results");
        if (results instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return List.of();
    }

    private String serviceUrlForPrefix(String prefix) {
        return switch (prefix) {
            case "CAS" -> casteCertUrl;
            case "PEN" -> casteCertUrl.replace("caste-certificate-service", "pension-service");
            case "MAR" -> casteCertUrl.replace("caste-certificate-service", "marriage-certificate-service");
            case "FAM" -> casteCertUrl.replace("caste-certificate-service", "family-member-service");
            case "SCH" -> casteCertUrl.replace("caste-certificate-service", "scheme-application-service");
            default -> null;
        };
    }

    private String handleCheckStatus(ChatSession session, String input, String sid, String lang) {
        sessions.put(sid, session.cleared());
        return lookupSingleApplication(normalizeRef(input), session, lang);
    }

    private static String normalizeRef(String input) {
        return AppRefNormalizer.normalize(input);
    }

    private String lookupSingleApplication(String ref, ChatSession session, String lang) {
        String prefix = ref.length() >= 3 ? ref.substring(0, 3) : "";
        String serviceUrl = serviceUrlForPrefix(prefix);
        if (serviceUrl != null) {
            // Direct track lookup (works without login — same as Contact Centre)
            try {
                @SuppressWarnings("unchecked")
                var tracked = (Map<String, Object>) webClient.get()
                        .uri(serviceUrl + "/v1/applications/track/" + ref)
                        .retrieve()
                        .bodyToMono(Map.class)
                        .block();
                if (tracked != null && !tracked.isEmpty()) {
                    String status = String.valueOf(tracked.getOrDefault("status", "UNKNOWN"));
                    String step = String.valueOf(tracked.getOrDefault("currentTask", ""));
                    String stepPart = (step.isBlank() || "null".equals(step)) ? "" : " — " + step;
                    return Msgs.get(Msgs.STATUS_RESULT, lang, ref, status, stepPart);
                }
            } catch (Exception e) {
                log.warn("Status lookup via track endpoint failed for {}: {}", ref, e.getMessage());
            }
            // Fallback: search logged-in citizen's application list
            try {
                String aadhaar = session.aadhaarRef();
                if (aadhaar != null && !aadhaar.isBlank()) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> apps = webClient.get()
                            .uri(serviceUrl + "/v1/applications?aadhaar=" + aadhaar)
                            .retrieve()
                            .bodyToMono(List.class)
                            .block();
                    if (apps != null) {
                        for (Map<String, Object> app : apps) {
                            String appNo = String.valueOf(app.getOrDefault("applicationNo", ""));
                            String engineRef = String.valueOf(app.getOrDefault("engineRef", ""));
                            if (ref.equals(appNo) || ref.equals(engineRef)) {
                                String status = String.valueOf(app.getOrDefault("status", "UNKNOWN"));
                                String step = String.valueOf(app.getOrDefault("currentTask", ""));
                                String stepPart = (step.isBlank() || "null".equals(step)) ? "" : " — " + step;
                                return Msgs.get(Msgs.STATUS_RESULT, lang, ref, status, stepPart);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Status lookup by application list failed for {}: {}", ref, e.getMessage());
            }
            return Msgs.get(Msgs.STATUS_NOT_FOUND, lang, ref);
        }
        // Legacy engineRef format: FLW-... / DGT-...
        try {
            @SuppressWarnings("unchecked")
            var res = (Map<String, Object>) webClient.get()
                    .uri(casteCertUrl + "/v1/applications/track/" + ref)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();
            if (res == null) return Msgs.get(Msgs.STATUS_NOT_FOUND, lang, ref);
            String status = String.valueOf(res.getOrDefault("status", "UNKNOWN"));
            String step = String.valueOf(res.getOrDefault("currentTask", ""));
            String stepPart = (step.isBlank() || "null".equals(step)) ? "" : " — " + step;
            return Msgs.get(Msgs.STATUS_RESULT, lang, ref, status, stepPart);
        } catch (Exception e) {
            return Msgs.get(Msgs.STATUS_NOT_FOUND, lang, ref);
        }
    }

    private String fetchAllApplicationsText(String aadhaarRef, String lang) {
        String[] prefixes = {"CAS", "PEN", "MAR", "FAM", "SCH"};
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (String prefix : prefixes) {
            String url = serviceUrlForPrefix(prefix);
            if (url == null) continue;
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> apps = webClient.get()
                        .uri(url + "/v1/applications?aadhaar=" + aadhaarRef)
                        .retrieve()
                        .bodyToMono(List.class)
                        .block();
                if (apps != null) {
                    for (Map<String, Object> app : apps) {
                        String appNo = String.valueOf(app.getOrDefault("applicationNo", ""));
                        String status = String.valueOf(app.getOrDefault("status", "PENDING"));
                        if (!appNo.isBlank() && !"null".equals(appNo)) {
                            sb.append(appNo).append(" — ").append(status).append("\n");
                            count++;
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to fetch apps for prefix {}: {}", prefix, e.getMessage());
            }
        }
        if (count == 0) return Msgs.get(Msgs.STATUS_AUTO_NONE, lang);
        return Msgs.get(Msgs.STATUS_AUTO_HEADER, lang, sb.toString().trim());
    }

    private String handleEligibility(ChatSession session, String input, String sid, String lang) {
        String aadhaarRef = input.trim();
        sessions.put(sid, session.withAadhaar(aadhaarRef).cleared());
        return performEligibilityLookup(aadhaarRef, lang);
    }

    private String performEligibilityLookup(String aadhaarRef, String lang) {
        try {
            List<Map<String, Object>> persons = searchPersonsByAadhaar(aadhaarRef);
            if (persons.isEmpty()) {
                return Msgs.get(Msgs.ELIGIBILITY_NONE, lang);
            }
            String familyId = String.valueOf(persons.get(0).get("familyId"));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> schemes = webClient.get()
                    .uri(schemeEngineUrl + "/v1/beneficiaries/family/" + familyId)
                    .retrieve()
                    .bodyToMono(List.class)
                    .block();
            if (schemes == null || schemes.isEmpty()) {
                return Msgs.get(Msgs.ELIGIBILITY_NONE, lang);
            }
            StringBuilder list = new StringBuilder();
            for (int i = 0; i < schemes.size(); i++) {
                Map<String, Object> s = schemes.get(i);
                String status = String.valueOf(s.getOrDefault("status", "IDENTIFIED"));
                list.append(i + 1).append(". ")
                        .append(s.getOrDefault("schemeName", "Scheme"))
                        .append(" — ").append(schemeStatusLabel(status, lang))
                        .append("\n");
            }
            return Msgs.get(Msgs.ELIGIBILITY_FOUND, lang,
                    String.valueOf(schemes.size()), list.toString().trim());
        } catch (Exception e) {
            log.error("Eligibility lookup failed for {}: {}", aadhaarRef, e.getMessage());
            return Msgs.get(Msgs.LOOKUP_ERROR, lang);
        }
    }

    private String schemeStatusLabel(String status, String lang) {
        boolean gu = "gu".equals(lang);
        return switch (status) {
            case "CONFIRMED" -> gu ? "લાભ લઇ રહ્યા છો" : "Availed";
            case "IDENTIFIED" -> gu ? "પાત્ર છો" : "Eligible";
            default -> status;
        };
    }

    @Scheduled(fixedDelay = 60_000)
    public void cleanSessions() {
        Instant cutoff = Instant.now().minus(timeoutMinutes, ChronoUnit.MINUTES);
        sessions.entrySet().removeIf(e -> e.getValue().lastActivity().isBefore(cutoff));
    }
}
