package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.domain.ActionType;
import org.magicsword.expenditure.entity.IntegrityAction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface IntegrityActionRepository extends JpaRepository<IntegrityAction, UUID> {
    List<IntegrityAction> findByCaseIdOrderByCreatedAtDesc(UUID caseId);
    List<IntegrityAction> findByActionType(ActionType actionType);
}
