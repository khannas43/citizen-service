package org.magicsword.expenditure.service;

import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.PaymentSettlement;
import org.magicsword.expenditure.entity.SchemeGraceConfig;
import org.magicsword.expenditure.entity.VerificationEvent;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.PaymentSettlementRepository;
import org.magicsword.expenditure.repository.SchemeGraceConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Counts people who already have settled payments beyond grace after a verified death or termination (rule 803 logic). */
@Service
public class VerifiedEventRiskService {

    private final EntitlementUnitRepository unitRepo;
    private final PaymentSettlementRepository paymentRepo;
    private final SchemeGraceConfigRepository graceRepo;

    @Value("${integrity.pilot.grace-days-after-death:30}")
    private int defaultGraceDays;

    public VerifiedEventRiskService(EntitlementUnitRepository unitRepo, PaymentSettlementRepository paymentRepo,
                                    SchemeGraceConfigRepository graceRepo) {
        this.unitRepo = unitRepo;
        this.paymentRepo = paymentRepo;
        this.graceRepo = graceRepo;
    }

    /** Distinct persons among {@code newEvents} who would violate rule 803 if detection ran now. */
    public int countPeopleAtRisk(List<VerificationEvent> newEvents) {
        Set<String> people = new HashSet<>();
        for (VerificationEvent ev : newEvents) {
            if (ev.getPersonId() == null || ev.getPersonId().isBlank()) {
                continue;
            }
            if (!DetectionEngineService.isTerminatingEvent(ev.getEventType()) || ev.getEventDate() == null) {
                continue;
            }
            if (personHasPaymentAfterGrace(ev)) {
                people.add(ev.getPersonId());
            }
        }
        return people.size();
    }

    boolean personHasPaymentAfterGrace(VerificationEvent ev) {
        List<EntitlementUnit> units = unitRepo.findByPersonId(ev.getPersonId()).stream()
                .filter(u -> "ACTIVE".equalsIgnoreCase(u.getStatus()))
                .toList();
        for (EntitlementUnit unit : units) {
            int grace = graceRepo.findBySchemeId(unit.getSchemeId())
                    .map(SchemeGraceConfig::getGraceDaysAfterTermination)
                    .orElse(defaultGraceDays);
            LocalDate cutoff = ev.getEventDate().plusDays(grace);
            List<PaymentSettlement> standing = PaymentStandingSupport.standingSettled(paymentRepo.findByUnitId(unit.getId()));
            for (PaymentSettlement p : standing) {
                if (p.getPeriodEnd() != null && p.getPeriodEnd().isAfter(cutoff)) {
                    return true;
                }
            }
        }
        return false;
    }
}
