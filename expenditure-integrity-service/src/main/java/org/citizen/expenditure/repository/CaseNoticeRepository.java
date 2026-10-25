package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.CaseNotice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CaseNoticeRepository extends JpaRepository<CaseNotice, UUID> {
    List<CaseNotice> findByCaseIdOrderByIssuedAtDesc(UUID caseId);

    Optional<CaseNotice> findFirstByCaseIdOrderByIssuedAtDesc(UUID caseId);
}
