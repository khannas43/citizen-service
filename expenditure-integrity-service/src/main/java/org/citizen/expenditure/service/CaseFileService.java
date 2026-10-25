package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Builds a printable case file (HTML or JSON) for auditors: header, alerts, timeline table, decision, outcomes,
 * verification and audit trail. Bank tokens are masked; Aadhaar is never included.
 */
@Service
public class CaseFileService {

    private static final LocalDate DEMO_CUTOFF = LocalDate.of(2026, 1, 1);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm");
    private static final DateTimeFormatter D = DateTimeFormatter.ofPattern("d MMM yyyy");

    private static final Map<String, String> RULE_NAMES = Map.ofEntries(
            Map.entry("801", "Repeated enrollment"),
            Map.entry("802", "Conflicting entitlement"),
            Map.entry("803", "Payment after verified event"),
            Map.entry("804", "Shared bank destination"),
            Map.entry("805", "Bank-change concentration"),
            Map.entry("806", "Eligibility mismatch"),
            Map.entry("807", "Salaried beneficiary"),
            Map.entry("S01", "Overlapping salary"),
            Map.entry("S02", "Post-event entitlement"),
            Map.entry("S03", "Excess allowance"),
            Map.entry("S04", "Duplicate arrears"),
            Map.entry("S05", "Pension mismatch"),
            Map.entry("S06", "Record verification risk"));

    private static final Set<String> HIDDEN_EVIDENCE = Set.of(
            "guestEvaluation", "payrollA", "payrollB", "payrollId", "payrollIds", "payments", "paymentId",
            "conflictingUnitId", "conflictingSchemeId");

    private static final Set<String> STRIP_KEYS = Set.of(
            "aadhaar", "aadhaarNumber", "maskedAadhaar", "aadhaarHash");

    private final IntegrityCaseService caseService;
    private final CaseTimelineService timelineService;

    public CaseFileService(IntegrityCaseService caseService, CaseTimelineService timelineService) {
        this.caseService = caseService;
        this.timelineService = timelineService;
    }

    public Optional<CaseFileExport> build(UUID caseId, Authentication auth) {
        Optional<IntegrityCaseService.CaseDetail> detailOpt = caseService.getCaseDetail(caseId);
        if (detailOpt.isEmpty()) {
            return Optional.empty();
        }
        IntegrityCaseService.CaseDetail detail = detailOpt.get();
        IntegrityCase c = detail.caseEntity();
        CaseTimelineService.Timeline timeline = timelineService.timeline(caseId).orElse(null);
        LocalDateTime generatedAt = LocalDateTime.now().withNano(0);
        String role = generatorRole(auth);
        boolean demo = c.getCreatedAt() != null && c.getCreatedAt().toLocalDate().isBefore(DEMO_CUTOFF);

        Map<String, Object> json = new LinkedHashMap<>();
        json.put("generatedAt", generatedAt.toString());
        json.put("generatedByRole", role);
        json.put("demoData", demo);
        json.put("header", header(c));
        json.put("alerts", alertsForExport(detail.alerts()));
        json.put("timeline", timelineTable(timeline));
        json.put("decision", decision(c));
        json.put("outcomes", outcomes(detail.actions()));
        json.put("verification", verification(c));
        json.put("auditTrail", auditTrail(detail.auditLog()));
        Map<String, Object> footer = new LinkedHashMap<>();
        footer.put("generatedAt", generatedAt.toString());
        footer.put("generatedByRole", role);
        if (demo) footer.put("demoDataLine", "Demo data");
        json.put("footer", footer);

        String html = renderHtml(json, demo);
        return Optional.of(new CaseFileExport(json, html));
    }

    public record CaseFileExport(Map<String, Object> json, String html) {}

    private static Map<String, Object> header(IntegrityCase c) {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("caseReference", c.getId().toString());
        h.put("title", c.getTitle());
        h.put("domain", c.getDomain() != null ? c.getDomain().name() : null);
        h.put("status", c.getStatus() != null ? c.getStatus().name() : null);
        h.put("createdAt", formatDateTime(c.getCreatedAt()));
        h.put("updatedAt", formatDateTime(c.getUpdatedAt()));
        h.put("assignee", c.getAssignee());
        return h;
    }

    private List<Map<String, Object>> alertsForExport(List<IntegrityAlert> alerts) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (IntegrityAlert a : alerts) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleCode", a.getRuleCode());
            row.put("ruleName", RULE_NAMES.getOrDefault(a.getRuleCode(), "Rule " + a.getRuleCode()));
            row.put("severity", a.getSeverity());
            row.put("amountAtStake", a.getAmountDelta());
            row.put("summary", summarise(a));
            row.put("personName", a.getPersonName());
            row.put("schemeName", a.getSchemeName());
            row.put("district", a.getDistrict());
            row.put("taluka", a.getTaluka());
            row.put("evidence", evidenceRows(sanitize(a.getEvidence())));
            out.add(row);
        }
        return out;
    }

    private static List<Map<String, String>> evidenceRows(Map<String, Object> evidence) {
        if (evidence == null || evidence.isEmpty()) return List.of();
        List<Map<String, String>> rows = new ArrayList<>();
        evidence.entrySet().stream()
                .filter(e -> !HIDDEN_EVIDENCE.contains(e.getKey()))
                .sorted(Comparator.comparingInt(e -> evidenceRank(e.getKey())))
                .forEach(e -> rows.add(Map.of("label", labelWords(e.getKey()), "value", formatEvidenceValue(e.getKey(), e.getValue()))));
        return rows;
    }

    private static int evidenceRank(String key) {
        List<String> order = List.of("variant", "authorizedAmount", "netSettled", "eventType", "eventDate", "graceDays",
                "bankToken", "operatorId", "bankChanges30d", "employeeCode", "post", "ddoCode", "reasons");
        int i = order.indexOf(key);
        return i >= 0 ? i : 100;
    }

    private static String summarise(IntegrityAlert alert) {
        String code = alert.getRuleCode();
        Map<String, Object> e = alert.getEvidence() != null ? alert.getEvidence() : Map.of();
        BigDecimal delta = alert.getAmountDelta();
        String money = delta != null && delta.signum() > 0 ? "₹" + delta.stripTrailingZeros().toPlainString() + " at stake" : "";
        if ("802".equals(code) && !"MUTUAL_EXCLUSION".equals(String.valueOf(e.get("variant"))) && e.get("netSettled") != null) {
            return "Net settled exceeds the authorised entitlement." + (money.isEmpty() ? "" : " " + money);
        }
        if ("805".equals(code)) {
            return "Unusual concentration of bank account changes by one operator in 30 days.";
        }
        if ("803".equals(code)) {
            return "Settlement recorded after a verified terminating event (grace applied where configured).";
        }
        return (RULE_NAMES.getOrDefault(code, "Rule " + code)) + " was triggered." + (money.isEmpty() ? "" : " " + money);
    }

    private static List<Map<String, Object>> timelineTable(CaseTimelineService.Timeline timeline) {
        if (timeline == null) return List.of();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (CaseTimelineService.Lane lane : timeline.lanes()) {
            for (CaseTimelineService.Item item : lane.items()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("date", item.start().format(D) + (item.end() != null && !item.end().equals(item.start())
                        ? " – " + item.end().format(D) : ""));
                row.put("lane", lane.label());
                row.put("kind", item.kind());
                row.put("label", item.label());
                row.put("detail", item.detail());
                row.put("amount", item.amount());
                row.put("flagged", item.flagged());
                rows.add(row);
            }
        }
        rows.sort(Comparator.comparing(r -> String.valueOf(r.get("date"))));
        return rows;
    }

    private static Map<String, Object> decision(IntegrityCase c) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("classification", c.getClassification() != null ? classificationLabel(c.getClassification()) : null);
        d.put("decisionText", c.getDecisionText());
        d.put("noticeRequired", c.isNoticeRequired());
        return d;
    }

    private static String classificationLabel(CaseClassification c) {
        return switch (c) {
            case LEGITIMATE_EXCEPTION -> "Legitimate exception";
            case DATA_ERROR -> "Data error";
            case SUSPECTED_OVERPAYMENT -> "Suspected overpayment";
            case CONFIRMED_OVERPAYMENT -> "Confirmed overpayment";
            case DISMISSED -> "Dismissed";
        };
    }

    private static List<Map<String, Object>> outcomes(List<IntegrityAction> actions) {
        return actions.stream()
                .sorted(Comparator.comparing(IntegrityAction::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("type", actionLabel(a.getActionType()));
                    m.put("reference", a.getExternalRef());
                    m.put("authoriser", a.getAuthoriser());
                    m.put("recordedAt", formatDateTime(a.getCreatedAt()));
                    m.put("payload", sanitize(a.getPayload()));
                    return m;
                }).toList();
    }

    private static String actionLabel(ActionType t) {
        if (t == null) return "";
        return switch (t) {
            case MASTER_CORRECTION -> "Master correction";
            case PAYMENT_ADJUSTMENT -> "Payment adjustment";
            case RECOVERY_RECORD -> "Recovery";
            case DISMISS -> "Close without action";
        };
    }

    private static Map<String, Object> verification(IntegrityCase c) {
        if (c.getVerifiedAt() == null) {
            return Map.of("verified", false);
        }
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("verified", true);
        v.put("verifiedAt", formatDateTime(c.getVerifiedAt()));
        v.put("verifiedBy", c.getVerifiedBy());
        v.put("note", c.getVerificationNote());
        return v;
    }

    private static List<Map<String, Object>> auditTrail(List<IntegrityAuditLog> logs) {
        return logs.stream()
                .sorted(Comparator.comparing(IntegrityAuditLog::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(l -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("at", formatDateTime(l.getCreatedAt()));
                    m.put("actorRole", l.getActorRole());
                    m.put("action", l.getAction());
                    m.put("details", sanitize(l.getDetails()));
                    return m;
                }).toList();
    }

    private static String generatorRole(Authentication auth) {
        if (auth == null) return "UNKNOWN";
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                .filter(r -> !"UNKNOWN".equals(r))
                .findFirst()
                .orElse("UNKNOWN");
    }

    static Map<String, Object> sanitize(Map<String, Object> raw) {
        if (raw == null) return Map.of();
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            if (STRIP_KEYS.contains(e.getKey())) continue;
            out.put(e.getKey(), sanitizeValue(e.getKey(), e.getValue()));
        }
        return out;
    }

    private static Object sanitizeValue(String key, Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> nested = new LinkedHashMap<>();
            for (Map.Entry<?, ?> en : m.entrySet()) {
                String k = String.valueOf(en.getKey());
                if (STRIP_KEYS.contains(k)) continue;
                nested.put(k, sanitizeValue(k, en.getValue()));
            }
            return nested;
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?>) {
                    out.add(sanitizeValue(key, item));
                } else {
                    out.add(maskIfBank(key, item));
                }
            }
            return out;
        }
        return maskIfBank(key, value);
    }

    private static Object maskIfBank(String key, Object value) {
        if (value == null) return null;
        String k = key == null ? "" : key.toLowerCase(Locale.ROOT);
        if (k.contains("bank") && value instanceof String s && !s.isBlank()) {
            return DetectionEngineService.maskToken(s);
        }
        return value;
    }

    private static String formatEvidenceValue(String key, Object value) {
        Object sanitized = sanitizeValue(key, value);
        if (sanitized == null) return "—";
        if (sanitized instanceof Collection<?> c) {
            if (c.isEmpty()) return "—";
            if (c.stream().allMatch(v -> v instanceof String && isUuid((String) v))) {
                String noun = key.contains("unit") ? "entitlement" : key.contains("payment") ? "payment" : "record";
                return c.size() + " " + noun + (c.size() == 1 ? "" : "s");
            }
            return c.stream().map(String::valueOf).reduce((a, b) -> a + ", " + b).orElse("—");
        }
        if (sanitized instanceof Boolean b) return b ? "Yes" : "No";
        if (sanitized instanceof Number n && key.matches("(?i).*amount.*|.*settled.*|.*rate.*|.*excess.*")) {
            return "₹" + new BigDecimal(n.toString()).stripTrailingZeros().toPlainString();
        }
        return String.valueOf(sanitized);
    }

    private static boolean isUuid(String s) {
        return s.length() == 36 && s.chars().filter(ch -> ch == '-').count() == 4;
    }

    private static String labelWords(String key) {
        if (key == null || key.isBlank()) return "";
        String spaced = key.replaceAll("([a-z])([A-Z])", "$1 $2").replace('_', ' ');
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    private static String formatDateTime(LocalDateTime t) {
        return t == null ? "—" : t.format(DT);
    }

    private static String renderHtml(Map<String, Object> json, boolean demo) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/><title>Case file</title><style>");
        sb.append("""
                body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;margin:0;padding:24px;line-height:1.45;font-size:14px;}
                h1{font-size:1.35rem;margin:0 0 8px;} h2{font-size:1.05rem;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px;}
                table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px;}
                th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}
                th{background:#f4f6fa;} dl{display:grid;grid-template-columns:minmax(140px,32%) 1fr;gap:4px 12px;margin:0;}
                dt{font-weight:600;color:#444;} dd{margin:0;} .meta{color:#555;font-size:13px;}
                .flagged{background:#fff4e5;} footer{margin-top:32px;padding-top:12px;border-top:1px solid #ccc;font-size:12px;color:#666;}
                @media print{@page{size:A4;margin:18mm;} body{padding:0;} h2{break-after:avoid;} table{break-inside:avoid;}}
                """);
        sb.append("</style></head><body>");

        @SuppressWarnings("unchecked")
        Map<String, Object> header = (Map<String, Object>) json.get("header");
        sb.append("<h1>Expenditure integrity — case file</h1>");
        sb.append("<p class=\"meta\"><strong>Reference:</strong> ").append(esc(header.get("caseReference")))
                .append(" · <strong>Status:</strong> ").append(esc(header.get("status")))
                .append(" · <strong>Domain:</strong> ").append(esc(header.get("domain"))).append("</p>");
        sb.append("<p class=\"meta\"><strong>Title:</strong> ").append(esc(header.get("title"))).append("</p>");
        sb.append("<p class=\"meta\">Created ").append(esc(header.get("createdAt")))
                .append(" · Last updated ").append(esc(header.get("updatedAt")))
                .append(" · Assignee ").append(esc(header.get("assignee"))).append("</p>");

        sb.append("<h2>Alerts</h2>");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> alerts = (List<Map<String, Object>>) json.get("alerts");
        for (Map<String, Object> a : alerts) {
            sb.append("<h3>").append(esc(a.get("ruleCode"))).append(" — ").append(esc(a.get("ruleName")))
                    .append(" (").append(esc(a.get("severity"))).append(")</h3>");
            sb.append("<p>").append(esc(a.get("summary"))).append("</p>");
            if (a.get("amountAtStake") != null) {
                sb.append("<p class=\"meta\">Amount at stake: ").append(esc(formatEvidenceValue("amount", a.get("amountAtStake")))).append("</p>");
            }
            sb.append("<dl>");
            @SuppressWarnings("unchecked")
            List<Map<String, String>> ev = (List<Map<String, String>>) a.get("evidence");
            for (Map<String, String> row : ev) {
                sb.append("<dt>").append(esc(row.get("label"))).append("</dt><dd>").append(esc(row.get("value"))).append("</dd>");
            }
            sb.append("</dl>");
        }

        sb.append("<h2>Timeline</h2><table><thead><tr><th>Date</th><th>Lane</th><th>Item</th><th>Detail</th><th>Amount</th><th>Flagged</th></tr></thead><tbody>");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> timeline = (List<Map<String, Object>>) json.get("timeline");
        for (Map<String, Object> row : timeline) {
            String cls = Boolean.TRUE.equals(row.get("flagged")) ? " class=\"flagged\"" : "";
            sb.append("<tr").append(cls).append("><td>").append(esc(row.get("date"))).append("</td><td>")
                    .append(esc(row.get("lane"))).append("</td><td>").append(esc(row.get("label")))
                    .append("</td><td>").append(esc(row.get("detail"))).append("</td><td>")
                    .append(row.get("amount") != null ? "₹" + esc(String.valueOf(row.get("amount"))) : "—")
                    .append("</td><td>").append(Boolean.TRUE.equals(row.get("flagged")) ? "Yes" : "No").append("</td></tr>");
        }
        sb.append("</tbody></table>");

        @SuppressWarnings("unchecked")
        Map<String, Object> decision = (Map<String, Object>) json.get("decision");
        sb.append("<h2>Decision</h2><dl>");
        sb.append("<dt>Classification</dt><dd>").append(esc(decision.get("classification"))).append("</dd>");
        sb.append("<dt>Reason</dt><dd>").append(esc(decision.get("decisionText"))).append("</dd>");
        sb.append("<dt>Notice required</dt><dd>").append(Boolean.TRUE.equals(decision.get("noticeRequired")) ? "Yes" : "No").append("</dd></dl>");

        sb.append("<h2>Outcomes recorded</h2>");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> outcomes = (List<Map<String, Object>>) json.get("outcomes");
        if (outcomes.isEmpty()) {
            sb.append("<p class=\"meta\">None recorded.</p>");
        } else {
            sb.append("<table><thead><tr><th>Type</th><th>Reference</th><th>Authoriser</th><th>Date</th></tr></thead><tbody>");
            for (Map<String, Object> o : outcomes) {
                sb.append("<tr><td>").append(esc(o.get("type"))).append("</td><td>").append(esc(o.get("reference")))
                        .append("</td><td>").append(esc(o.get("authoriser"))).append("</td><td>")
                        .append(esc(o.get("recordedAt"))).append("</td></tr>");
            }
            sb.append("</tbody></table>");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> verification = (Map<String, Object>) json.get("verification");
        sb.append("<h2>Verification</h2>");
        if (!Boolean.TRUE.equals(verification.get("verified"))) {
            sb.append("<p class=\"meta\">Not yet verified closed.</p>");
        } else {
            sb.append("<dl><dt>Verified at</dt><dd>").append(esc(verification.get("verifiedAt")))
                    .append("</dd><dt>Verified by</dt><dd>").append(esc(verification.get("verifiedBy")))
                    .append("</dd><dt>Note</dt><dd>").append(esc(verification.get("note"))).append("</dd></dl>");
        }

        sb.append("<h2>Audit trail</h2><table><thead><tr><th>When</th><th>Role</th><th>Action</th><th>Details</th></tr></thead><tbody>");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> audit = (List<Map<String, Object>>) json.get("auditTrail");
        for (Map<String, Object> row : audit) {
            sb.append("<tr><td>").append(esc(row.get("at"))).append("</td><td>").append(esc(row.get("actorRole")))
                    .append("</td><td>").append(esc(row.get("action"))).append("</td><td>")
                    .append(esc(String.valueOf(row.get("details")))).append("</td></tr>");
        }
        sb.append("</tbody></table>");

        sb.append("<footer><p>Generated ").append(esc(json.get("generatedAt")))
                .append(" · Role ").append(esc(json.get("generatedByRole"))).append("</p>");
        if (demo) sb.append("<p><strong>Demo data</strong></p>");
        sb.append("</footer></body></html>");
        return sb.toString();
    }

    private static String esc(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o);
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
