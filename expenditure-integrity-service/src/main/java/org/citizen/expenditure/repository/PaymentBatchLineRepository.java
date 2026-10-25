package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.PaymentBatchLine;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface PaymentBatchLineRepository extends JpaRepository<PaymentBatchLine, UUID> {

    Page<PaymentBatchLine> findByBatchId(UUID batchId, Pageable pageable);

    Page<PaymentBatchLine> findByBatchIdAndVerdict(UUID batchId, String verdict, Pageable pageable);

    /** verdict, decision, how many lines, their total amount: everything a batch summary shows, in one query */
    @Query("select l.verdict, l.decision, count(l), coalesce(sum(l.amount), 0) from PaymentBatchLine l where l.batchId = :batchId group by l.verdict, l.decision")
    List<Object[]> summarise(@Param("batchId") UUID batchId);

    @Query("select coalesce(sum(l.amount), 0) from PaymentBatchLine l where l.decision = :decision")
    BigDecimal sumAmountByDecision(@Param("decision") String decision);

    @Query("select coalesce(sum(l.amount), 0) from PaymentBatchLine l where l.verdict = 'HOLD' and l.decision = 'NONE'")
    BigDecimal sumPendingHolds();

    long countByDecision(String decision);

    List<PaymentBatchLine> findByDecisionAndDecidedAtGreaterThanEqual(String decision, LocalDateTime since);
}
