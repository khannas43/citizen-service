package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.IntegrityCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface IntegrityCaseRepository extends JpaRepository<IntegrityCase, UUID> {}
