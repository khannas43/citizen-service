package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.MutualExclusionSchemePair;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface MutualExclusionSchemePairRepository extends JpaRepository<MutualExclusionSchemePair, UUID> {}
