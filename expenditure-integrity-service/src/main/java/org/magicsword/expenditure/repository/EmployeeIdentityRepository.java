package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmployeeIdentityRepository extends JpaRepository<EmployeeIdentity, UUID> {
    Optional<EmployeeIdentity> findByEmployeeCode(String employeeCode);

    Optional<EmployeeIdentity> findFirstByPersonId(String personId);

    List<EmployeeIdentity> findByPersonIdIn(java.util.Collection<String> personIds);
}
