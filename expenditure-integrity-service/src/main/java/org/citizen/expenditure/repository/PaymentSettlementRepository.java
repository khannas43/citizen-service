package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.PaymentSettlement;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface PaymentSettlementRepository extends JpaRepository<PaymentSettlement, UUID> {
    List<PaymentSettlement> findByUnitId(UUID unitId);

    List<PaymentSettlement> findByUnitIdIn(java.util.Collection<java.util.UUID> unitIds);

    List<PaymentSettlement> findByBankTokenIn(java.util.Collection<String> bankTokens);

    boolean existsByTransactionRef(String transactionRef);
}
