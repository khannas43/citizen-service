package org.citizen.expenditure.service;

import org.citizen.expenditure.domain.ActionType;
import org.citizen.expenditure.domain.CaseClassification;
import org.citizen.expenditure.domain.IntegrityDomain;
import org.citizen.expenditure.entity.IntegrityAction;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.entity.IntegrityCase;
import org.citizen.expenditure.repository.IntegrityActionRepository;
import org.citizen.expenditure.repository.IntegrityAlertRepository;
import org.citizen.expenditure.repository.IntegrityCaseRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AcceptanceMetricsService {

    private final IntegrityCaseRepository caseRepo;
    private final IntegrityAlertRepository alertRepo;
    private final IntegrityActionRepository actionRepo;

    public AcceptanceMetricsService(
            IntegrityCaseRepository caseRepo,
            IntegrityAlertRepository alertRepo,
            IntegrityActionRepository actionRepo) {
        this.caseRepo = caseRepo;
        this.alertRepo = alertRepo;
        this.actionRepo = actionRepo;
    }

    public Map<String, Object> metrics() {
        return metrics(null);
    }

    /** When domain is set, alert counts match the beneficiary or payroll tab (not both combined). */
    public Map<String, Object> metrics(IntegrityDomain domain) {
        List<IntegrityCase> cases = caseRepo.findAll();
        List<IntegrityAlert> alerts = alertRepo.findAll();
        List<IntegrityAction> actions = actionRepo.findAll();

        if (domain != null) {
            cases = cases.stream().filter(c -> domain == c.getDomain()).toList();
            alerts = alerts.stream().filter(a -> domain == a.getDomain()).toList();
            Set<UUID> caseIds = cases.stream().map(IntegrityCase::getId).collect(Collectors.toSet());
            actions = actions.stream().filter(a -> a.getCaseId() != null && caseIds.contains(a.getCaseId())).toList();
        }

        Set<UUID> confirmed = cases.stream()
                .filter(c -> c.getClassification() == CaseClassification.CONFIRMED_OVERPAYMENT)
                .map(IntegrityCase::getId)
                .collect(Collectors.toSet());
        BigDecimal verifiedOverpayment = alerts.stream()
                .filter(a -> a.getCaseId() != null && confirmed.contains(a.getCaseId()))
                .map(a -> a.getAmountDelta() != null ? a.getAmountDelta() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long recoveryRecorded = actions.stream().filter(IntegrityActionSupport::countsAsRecovery).count();
        long masterCorrections = actions.stream().filter(a -> a.getActionType() == ActionType.MASTER_CORRECTION).count();
        long dismissed = cases.stream().filter(c -> c.getClassification() == CaseClassification.DISMISSED).count();
        long openAlerts = alerts.stream().filter(a -> "OPEN".equals(a.getStatus())).count();
        Set<UUID> recoveryCaseIds = actionRepo.findByActionType(ActionType.RECOVERY_RECORD).stream()
                .filter(IntegrityActionSupport::countsAsRecovery)
                .map(IntegrityAction::getCaseId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        long resolvedAlerts = alerts.stream().filter(a -> "RESOLVED".equals(a.getStatus())).count();
        if (domain == IntegrityDomain.PAYROLL) {
            resolvedAlerts = alerts.stream()
                    .filter(a -> "RESOLVED".equals(a.getStatus()))
                    .filter(a -> a.getCaseId() == null || !recoveryCaseIds.contains(a.getCaseId()))
                    .count();
        }

        Map<String, Object> m = new HashMap<>();
        m.put("verifiedOverpaymentAmount", verifiedOverpayment);
        m.put("recoveryActionsRecorded", recoveryRecorded);
        m.put("masterCorrectionsRecorded", masterCorrections);
        m.put("overturnedOrDismissed", dismissed);
        m.put("openAlerts", openAlerts);
        m.put("resolvedAlerts", resolvedAlerts);
        m.put("totalCases", cases.size());
        return m;
    }
}
