package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.PaymentBatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentBatchRepository extends JpaRepository<PaymentBatch, UUID> {
    List<PaymentBatch> findTop50ByOrderByUploadedAtDesc();
}
