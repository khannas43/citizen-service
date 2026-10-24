package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.IntegrityAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface IntegrityAlertRepository extends JpaRepository<IntegrityAlert, UUID> {
    List<IntegrityAlert> findByDomainAndStatus(IntegrityDomain domain, String status);
    List<IntegrityAlert> findByRuleCodeAndPersonId(String ruleCode, String personId);

    List<IntegrityAlert> findByCaseId(UUID caseId);

    List<IntegrityAlert> findByDomainAndPersonId(IntegrityDomain domain, String personId);
}
