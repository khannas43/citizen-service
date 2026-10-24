package org.magicsword.expenditure.service;

import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.IntegrityAlert;

import java.math.BigDecimal;
import java.util.UUID;

/** One alert the detection rules would raise in a dry run. */
public record CollectedFinding(
        IntegrityDomain domain,
        String ruleCode,
        String personId,
        UUID schemeId,
        BigDecimal amountDelta,
        String personName) {

    static CollectedFinding fromAlert(IntegrityAlert alert) {
        return new CollectedFinding(
                alert.getDomain(),
                alert.getRuleCode(),
                alert.getPersonId(),
                alert.getSchemeId(),
                alert.getAmountDelta() != null ? alert.getAmountDelta() : BigDecimal.ZERO,
                alert.getPersonName());
    }

    String dedupeKey() {
        return ruleCode + "|" + personId + "|" + (schemeId != null ? schemeId : "");
    }
}
