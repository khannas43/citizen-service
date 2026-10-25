package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.IntegrityAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface IntegrityAuditLogRepository extends JpaRepository<IntegrityAuditLog, UUID> {
    List<IntegrityAuditLog> findByCaseIdOrderByCreatedAtDesc(UUID caseId);
}
