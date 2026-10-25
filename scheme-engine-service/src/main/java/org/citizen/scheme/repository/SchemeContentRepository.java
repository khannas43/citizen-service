package org.citizen.scheme.repository;

import org.citizen.scheme.entity.SchemeContent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SchemeContentRepository extends JpaRepository<SchemeContent, UUID> {
    List<SchemeContent> findBySchemeIdIn(Collection<UUID> schemeIds);
}
