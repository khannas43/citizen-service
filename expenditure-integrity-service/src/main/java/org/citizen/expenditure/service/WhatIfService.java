package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.IntegrityDomain;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class WhatIfService {

    private static final List<String> RULE_ORDER = List.of(
            "801", "802", "803", "804", "805", "S01", "S02", "S03", "S04", "S05", "S06");

    private final DetectionEngineService detectionEngine;

    public WhatIfService(DetectionEngineService detectionEngine) {
        this.detectionEngine = detectionEngine;
    }

    public Map<String, Object> defaults() {
        DetectionSettings s = detectionEngine.liveSettings();
        return Map.of(
                "rule804MinUnits", s.bankClusterMin(),
                "rule805Threshold", s.operatorChangeThreshold(),
                "graceDaysDefault", s.defaultGraceDays(),
                "s06LifeCertificateDays", s.lifeCertificateMaxAgeDays(),
                "s06BankChangeWindowDays", s.bankChangeWindowDays());
    }

    public WhatIfResponse run(DetectionSettings.WhatIfRequest request) {
        DetectionSettings live = detectionEngine.liveSettings();
        DetectionSettings proposed = live.withWhatIfOverrides(request);
        List<CollectedFinding> today = detectionEngine.collectFindings(live, true);
        List<CollectedFinding> withChange = detectionEngine.collectFindings(proposed, true);

        Map<String, List<CollectedFinding>> todayByRule = groupByRule(today);
        Map<String, List<CollectedFinding>> changeByRule = groupByRule(withChange);

        List<Map<String, Object>> rules = new ArrayList<>();
        for (String code : RULE_ORDER) {
            Set<String> todayKeys = keys(todayByRule.getOrDefault(code, List.of()));
            Set<String> changeKeys = keys(changeByRule.getOrDefault(code, List.of()));
            int added = (int) changeKeys.stream().filter(k -> !todayKeys.contains(k)).count();
            int dropped = (int) todayKeys.stream().filter(k -> !changeKeys.contains(k)).count();
            List<CollectedFinding> todayList = todayByRule.getOrDefault(code, List.of());
            List<CollectedFinding> changeList = changeByRule.getOrDefault(code, List.of());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleCode", code);
            row.put("today", todayList.size());
            row.put("withChange", changeList.size());
            row.put("added", added);
            row.put("dropped", dropped);
            row.put("amountToday", sumAmount(todayList));
            row.put("amountWithChange", sumAmount(changeList));
            row.put("samplePeople", sampleNamesForRule(code, todayKeys, changeList));
            rules.add(row);
        }

        List<String> sentences = buildSentences(live, proposed, request, rules);
        return new WhatIfResponse(
                rules,
                sentences,
                "Rules 806 and 807 call the scheme engine and are not changed by these settings.");
    }

    private static Map<String, List<CollectedFinding>> groupByRule(List<CollectedFinding> findings) {
        return findings.stream().collect(Collectors.groupingBy(CollectedFinding::ruleCode));
    }

    private static Set<String> keys(List<CollectedFinding> list) {
        return list.stream().map(CollectedFinding::dedupeKey).collect(Collectors.toSet());
    }

    private static BigDecimal sumAmount(List<CollectedFinding> list) {
        return list.stream().map(CollectedFinding::amountDelta).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Up to 10 names from added findings (beneficiary rules only; payroll rules return none). */
    private static List<String> sampleNamesForRule(String ruleCode, Set<String> todayKeys, List<CollectedFinding> changeList) {
        if (ruleCode.startsWith("S")) {
            return List.of();
        }
        return changeList.stream()
                .filter(f -> f.domain() == IntegrityDomain.BENEFICIARY)
                .filter(f -> !todayKeys.contains(f.dedupeKey()))
                .map(CollectedFinding::personName)
                .filter(Objects::nonNull)
                .filter(n -> !n.isBlank())
                .distinct()
                .limit(10)
                .toList();
    }

    private static List<String> buildSentences(
            DetectionSettings live,
            DetectionSettings proposed,
            DetectionSettings.WhatIfRequest req,
            List<Map<String, Object>> rules) {
        List<String> out = new ArrayList<>();
        if (req.rule804MinUnits() != null && !req.rule804MinUnits().equals(live.bankClusterMin())) {
            sentenceForRule(out, "804", live.bankClusterMin(), req.rule804MinUnits(), rules);
        }
        if (req.rule805Threshold() != null && !req.rule805Threshold().equals(live.operatorChangeThreshold())) {
            sentenceForRule(out, "805", live.operatorChangeThreshold(), req.rule805Threshold(), rules);
        }
        if (req.graceDaysDefault() != null && !req.graceDaysDefault().equals(live.defaultGraceDays())) {
            sentenceForRule(out, "803", live.defaultGraceDays(), req.graceDaysDefault(), rules);
        }
        if (req.s06LifeCertificateDays() != null && !req.s06LifeCertificateDays().equals(live.lifeCertificateMaxAgeDays())) {
            sentenceForRule(out, "S06", live.lifeCertificateMaxAgeDays(), req.s06LifeCertificateDays(), rules);
        }
        if (req.s06BankChangeWindowDays() != null && !req.s06BankChangeWindowDays().equals(live.bankChangeWindowDays())) {
            sentenceForRule(out, "S06", live.bankChangeWindowDays(), req.s06BankChangeWindowDays(), rules);
        }
        return out;
    }

    private static void sentenceForRule(
            List<String> out, String ruleCode, int from, int to, List<Map<String, Object>> rules) {
        Map<String, Object> row = rules.stream().filter(r -> ruleCode.equals(r.get("ruleCode"))).findFirst().orElse(Map.of());
        int today = ((Number) row.getOrDefault("today", 0)).intValue();
        int withChange = ((Number) row.getOrDefault("withChange", 0)).intValue();
        String dir = to > from ? "Raising" : "Lowering";
        String setting = switch (ruleCode) {
            case "804" -> "the shared-bank minimum from " + from + " to " + to;
            case "805" -> "the bank-change threshold from " + from + " to " + to;
            case "803" -> "the default grace days after a verified event from " + from + " to " + to;
            case "S06" -> "an S06 window from " + from + " to " + to;
            default -> "the setting from " + from + " to " + to;
        };
        out.add(String.format("%s %s would change rule %s from %d alerts to %d.", dir, setting, ruleCode, today, withChange));
    }

    public record WhatIfResponse(List<Map<String, Object>> rules, List<String> sentences, String schemeEngineNote) {}
}
