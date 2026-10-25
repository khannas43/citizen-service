package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.EntitlementUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface EntitlementUnitRepository extends JpaRepository<EntitlementUnit, UUID> {
    List<EntitlementUnit> findByPersonId(String personId);

    List<EntitlementUnit> findByPersonIdIn(java.util.Collection<String> personIds);
}
