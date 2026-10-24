package org.magicsword.scheme.repository;

import org.magicsword.scheme.entity.SchemeBenefitComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SchemeBenefitComponentRepository extends JpaRepository<SchemeBenefitComponent, UUID> {
    List<SchemeBenefitComponent> findBySchemeId(UUID schemeId);
    Optional<SchemeBenefitComponent> findBySchemeIdAndCourseCategory(UUID schemeId, String courseCategory);
}
