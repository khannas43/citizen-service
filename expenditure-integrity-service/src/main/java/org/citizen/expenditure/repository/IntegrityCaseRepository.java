package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.IntegrityCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface IntegrityCaseRepository extends JpaRepository<IntegrityCase, UUID> {}
