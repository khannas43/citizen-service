package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.PensionAuthorisation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PensionAuthorisationRepository extends JpaRepository<PensionAuthorisation, UUID> {
    Optional<PensionAuthorisation> findByEmployeeCode(String employeeCode);
}
