package org.citizen.scheme.repository;

import org.citizen.scheme.entity.SchemeContentAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SchemeContentAuditRepository extends JpaRepository<SchemeContentAudit, UUID> {
    List<SchemeContentAudit> findBySchemeIdOrderByTimestampDesc(UUID schemeId);
}
