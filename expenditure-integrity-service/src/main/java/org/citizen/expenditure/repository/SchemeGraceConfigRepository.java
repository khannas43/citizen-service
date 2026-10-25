package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.SchemeGraceConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface SchemeGraceConfigRepository extends JpaRepository<SchemeGraceConfig, UUID> {
    Optional<SchemeGraceConfig> findBySchemeId(UUID schemeId);
}
