package org.magicsword.scheme.repository;

import org.magicsword.scheme.entity.CustomRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CustomRuleRepository extends JpaRepository<CustomRule, UUID> {
    List<CustomRule> findAllByOrderByCreatedAtDesc();
}
