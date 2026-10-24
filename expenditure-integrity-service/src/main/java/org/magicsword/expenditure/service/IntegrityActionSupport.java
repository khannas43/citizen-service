package org.magicsword.expenditure.service;

import org.magicsword.expenditure.domain.ActionStatus;
import org.magicsword.expenditure.domain.ActionType;
import org.magicsword.expenditure.entity.IntegrityAction;

import java.math.BigDecimal;
import java.util.Map;

final class IntegrityActionSupport {

    private IntegrityActionSupport() {}

    static boolean countsAsRecovery(IntegrityAction action) {
        if (action == null || action.getActionType() != ActionType.RECOVERY_RECORD) {
            return false;
        }
        ActionStatus status = action.getActionStatus();
        return status == null || status == ActionStatus.APPROVED;
    }

    static BigDecimal recoveryAmount(Map<String, Object> payload) {
        if (payload == null) {
            return null;
        }
        Object raw = payload.get("amount");
        if (raw == null) {
            return null;
        }
        if (raw instanceof BigDecimal bd) {
            return bd;
        }
        if (raw instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(raw.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String requesterSubject(IntegrityAction action) {
        if (action.getRequestedBy() != null && !action.getRequestedBy().isBlank()) {
            return action.getRequestedBy();
        }
        return action.getAuthoriser();
    }
}
