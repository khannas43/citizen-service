package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.MutualExclusionSchemePair;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface MutualExclusionSchemePairRepository extends JpaRepository<MutualExclusionSchemePair, UUID> {}
