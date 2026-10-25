package org.citizen.expenditure.service;

import org.citizen.expenditure.entity.PaymentSettlement;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Settled payments that still stand after reversals are applied. */
final class PaymentStandingSupport {

    private PaymentStandingSupport() {}

    static List<PaymentSettlement> standingSettled(List<PaymentSettlement> all) {
        Set<UUID> reversed = all.stream().map(PaymentSettlement::getReversalOf).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return all.stream()
                .filter(p -> p.getReversalOf() == null && !reversed.contains(p.getId()) && "SETTLED".equalsIgnoreCase(p.getStatus()))
                .toList();
    }
}
