package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.domain.NoticeResponseKind;
import org.citizen.expenditure.entity.CaseNotice;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.IntegrityAuditLog;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.repository.CaseNoticeRepository;
import org.citizen.expenditure.repository.IntegrityAuditLogRepository;
import org.citizen.expenditure.repository.IntegrityCaseRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class NoticeService {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([a-zA-Z]+)}}");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter DATE_FMT_GU = DateTimeFormatter.ofPattern("d MMMM yyyy", new Locale("gu", "IN"));

    private final IntegrityCaseRepository caseRepo;
    private final IntegrityCaseService caseService;
    private final CaseNoticeRepository noticeRepo;
    private final IntegrityAuditLogRepository auditRepo;

    @Value("${officer.integrity.notice-response-days:15}")
    private int noticeResponseDays;

    public NoticeService(IntegrityCaseRepository caseRepo, IntegrityCaseService caseService,
                           CaseNoticeRepository noticeRepo, IntegrityAuditLogRepository auditRepo) {
        this.caseRepo = caseRepo;
        this.caseService = caseService;
        this.noticeRepo = noticeRepo;
        this.auditRepo = auditRepo;
    }

    public Map<String, Object> draft(UUID caseId, String lang) {
        IntegrityCase c = requireNoticeCase(caseId);
        String language = normalizeLang(lang);
        IntegrityCaseService.CaseDetail detail = caseService.getCaseDetail(caseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        Map<String, String> values = templateValues(c, detail, language);
        String template = loadTemplate(language, c.getDomain());
        String body = fillTemplate(template, values);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("language", language);
        out.put("text", body);
        out.put("responseDueOn", values.get("responseDueDateIso"));
        return out;
    }

    @Transactional
    public CaseNotice issue(UUID caseId, String lang, Jwt jwt) {
        IntegrityCase c = requireNoticeCase(caseId);
        String language = normalizeLang(lang);
        IntegrityCaseService.CaseDetail detail = caseService.getCaseDetail(caseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        Map<String, String> values = templateValues(c, detail, language);
        LocalDate due = LocalDate.parse(values.get("responseDueDateIso"));
        CaseNotice notice = new CaseNotice();
        notice.setCaseId(caseId);
        notice.setIssuedAt(LocalDateTime.now());
        notice.setIssuedBy(jwt.getSubject());
        notice.setLanguage(language);
        notice.setResponseDueOn(due);
        notice.setResponseKind(NoticeResponseKind.NONE);
        noticeRepo.save(notice);
        audit(caseId, jwt, "NOTICE_ISSUED", Map.of("language", language, "responseDueOn", due.toString(), "noticeId", notice.getId()));
        c.setUpdatedAt(LocalDateTime.now());
        caseRepo.save(c);
        return notice;
    }

    @Transactional
    public CaseNotice recordResponse(UUID caseId, NoticeResponseKind kind, String note, Jwt jwt) {
        if (kind == null || kind == NoticeResponseKind.NONE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A response kind is required.");
        }
        IntegrityCase c = caseRepo.findById(caseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        CaseNotice notice = noticeRepo.findFirstByCaseIdOrderByIssuedAtDesc(caseId)
                .filter(n -> n.getIssuedAt() != null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Issue a notice before recording a response."));
        if (notice.getResponseAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A response has already been recorded for the latest notice.");
        }
        notice.setResponseKind(kind);
        notice.setResponseAt(LocalDateTime.now());
        notice.setResponseNote(note != null ? note.trim() : null);
        noticeRepo.save(notice);
        c.setUpdatedAt(LocalDateTime.now());
        caseRepo.save(c);
        audit(caseId, jwt, "NOTICE_RESPONSE", Map.of(
                "responseKind", kind.name(),
                "note", notice.getResponseNote() != null ? notice.getResponseNote() : "",
                "noticeId", notice.getId()));
        return notice;
    }

    public Optional<CaseNotice> latestNotice(UUID caseId) {
        return noticeRepo.findFirstByCaseIdOrderByIssuedAtDesc(caseId);
    }

    private IntegrityCase requireNoticeCase(UUID caseId) {
        IntegrityCase c = caseRepo.findById(caseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found."));
        if (!c.isNoticeRequired()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This case is not marked as requiring a notice.");
        }
        if (c.getClassification() == null || c.getDecisionText() == null || c.getDecisionText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Record a decision before drafting a notice.");
        }
        return c;
    }

    static String fillTemplate(String template, Map<String, String> values) {
        var matcher = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1);
            if (!values.containsKey(key)) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Notice template has no value for placeholder: " + key);
            }
            String repl = values.get(key);
            matcher.appendReplacement(sb, Matcher.quoteReplacement(repl != null ? repl : ""));
        }
        matcher.appendTail(sb);
        String out = sb.toString();
        if (PLACEHOLDER.matcher(out).find()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Notice template still has unfilled placeholders.");
        }
        return out;
    }

    private Map<String, String> templateValues(IntegrityCase c, IntegrityCaseService.CaseDetail detail, String language) {
        List<IntegrityAlert> alerts = detail.alerts();
        IntegrityAlert primary = alerts.isEmpty() ? null : alerts.get(0);
        LocalDate decisionDate = c.getUpdatedAt() != null ? c.getUpdatedAt().toLocalDate() : LocalDate.now();
        LocalDate due = decisionDate.plusDays(noticeResponseDays);
        boolean gu = "gu".equals(language);
        Map<String, String> v = new LinkedHashMap<>();
        v.put("personName", personName(primary, detail));
        v.put("schemeOrPost", schemeOrPost(c.getDomain(), primary, detail));
        String period = knownPeriod(primary);
        BigDecimal stake = stake(alerts);
        v.put("period", period == null ? (gu ? "સંબંધિત સમયગાળો" : "the period under review") : period);
        v.put("amountAtStake", stake == null ? (gu ? "કેસ ફાઇલમાં દર્શાવેલ રકમ" : "the amount shown in the case file") : "₹" + stake.stripTrailingZeros().toPlainString());
        // the letter reads cleanly whether or not the period and the amount are known: the clause is left out when they are not
        v.put("periodClause", period == null ? "" : (gu ? " " + period + " સમયગાળા માટે" : " for the period " + period));
        v.put("amountClause", stake == null ? "" : (gu ? " ₹" + stake.stripTrailingZeros().toPlainString() + " જેટલી" : " of ₹" + stake.stripTrailingZeros().toPlainString()));
        v.put("decisionReason", c.getDecisionText().trim());
        v.put("responseDueDate", formatDate(due, gu));
        v.put("responseDueDateIso", due.toString());
        v.put("appealParagraph", appealParagraph(gu));
        return v;
    }

    private static String personName(IntegrityAlert alert, IntegrityCaseService.CaseDetail detail) {
        if (alert != null && alert.getPersonName() != null && !alert.getPersonName().isBlank()) {
            return alert.getPersonName().trim();
        }
        Object link = detail.evidenceContext().get("personLink");
        if (link instanceof Map<?, ?> m && m.get("personName") != null) {
            return m.get("personName").toString();
        }
        return "Sir/Madam";
    }

    private static String schemeOrPost(IntegrityDomain domain, IntegrityAlert alert, IntegrityCaseService.CaseDetail detail) {
        if (domain == IntegrityDomain.PAYROLL) {
            if (alert != null && alert.getEvidence() != null) {
                for (String key : List.of("postName", "designation", "employeeCode")) {
                    Object v = alert.getEvidence().get(key);
                    if (v != null && !v.toString().isBlank()) {
                        return v.toString();
                    }
                }
            }
            if (alert != null && alert.getPersonId() != null) {
                return "employee " + alert.getPersonId();
            }
            return "your post";
        }
        if (alert != null && alert.getSchemeName() != null && !alert.getSchemeName().isBlank()) {
            return alert.getSchemeName();
        }
        Object unit = detail.evidenceContext().get("entitlementUnit");
        if (unit instanceof Map<?, ?> m && m.get("schemeName") != null) {
            return m.get("schemeName").toString();
        }
        return "the scheme";
    }

    /** The period the alert names, or null when it names none. */
    private static String knownPeriod(IntegrityAlert alert) {
        if (alert == null || alert.getEvidence() == null) {
            return null;
        }
        Map<String, Object> ev = alert.getEvidence();
        String start = stringOrNull(ev.get("periodStart"));
        if (start == null) start = stringOrNull(ev.get("overlapStart"));
        String end = stringOrNull(ev.get("periodEnd"));
        if (end == null) end = stringOrNull(ev.get("overlapEnd"));
        if (start != null && end != null) {
            return start + " to " + end;
        }
        if (start != null) {
            return start + " onwards";
        }
        return null;
    }

    /** The total at stake, or null when no alert in the case carries an amount. */
    private static BigDecimal stake(List<IntegrityAlert> alerts) {
        BigDecimal sum = BigDecimal.ZERO;
        for (IntegrityAlert a : alerts) {
            if (a.getAmountDelta() != null) {
                sum = sum.add(a.getAmountDelta());
            }
        }
        return sum.signum() <= 0 ? null : sum;
    }

    private static String appealParagraph(boolean gu) {
        if (gu) {
            return "જો તમે આ નિર્ણય સાથે સહમત ન હો, તો તમે લેખિત અપીલ વિભાગના વરિષ્ઠ અધિકારી પાસે કરી શકો છો. અપીલમાં આ નોટિસની તારીખ અને તમારો હકદારી/કર્મચારી સંદર્ભ ઉલ્લેખ કરો.";
        }
        return "If you disagree with this finding, you may lodge a written appeal with the senior officer of the department. Quote the date of this notice and your entitlement or employee reference in the appeal.";
    }

    private static String formatDate(LocalDate date, boolean gu) {
        return (gu ? DATE_FMT_GU : DATE_FMT).format(date);
    }

    private static String stringOrNull(Object raw) {
        if (raw == null) return null;
        String s = raw.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private static String normalizeLang(String lang) {
        if (lang == null || lang.isBlank()) return "en";
        String l = lang.trim().toLowerCase(Locale.ROOT);
        if (!l.equals("en") && !l.equals("gu")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Language must be en or gu.");
        }
        return l;
    }

    private String loadTemplate(String lang, IntegrityDomain domain) {
        String file = domain == IntegrityDomain.PAYROLL ? "payroll.txt" : "beneficiary.txt";
        String path = "notices/" + lang + "/" + file;
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Notice template missing: " + path);
        }
    }

    private void audit(UUID caseId, Jwt jwt, String action, Map<String, Object> details) {
        IntegrityAuditLog log = new IntegrityAuditLog();
        log.setCaseId(caseId);
        log.setActor(jwt.getSubject());
        log.setActorRole(String.join(",", org.citizen.expenditure.security.OfficerRoleNormalizer.normalizedRoles(jwt)));
        log.setAction(action);
        log.setDetails(details);
        auditRepo.save(log);
    }
}
