package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.PayrollSettlement;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface PayrollSettlementRepository extends JpaRepository<PayrollSettlement, UUID> {
    List<PayrollSettlement> findByEmployeeCode(String employeeCode);

    List<PayrollSettlement> findByTransactionRefIn(java.util.Collection<String> transactionRefs);
}
