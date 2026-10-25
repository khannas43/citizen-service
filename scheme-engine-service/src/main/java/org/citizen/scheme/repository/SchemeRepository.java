package org.citizen.scheme.repository;

import org.citizen.scheme.entity.Scheme;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SchemeRepository extends JpaRepository<Scheme, UUID> {
    List<Scheme> findByIsActiveTrue();

    List<Scheme> findTop4ByIsActiveTrueAndCategoryIgnoreCaseAndIdNotOrderByNameAsc(
            String category, UUID id);

    List<Scheme> findTop4ByIsActiveTrueAndDepartmentIgnoreCaseAndIdNotOrderByNameAsc(
            String department, UUID id);
}
