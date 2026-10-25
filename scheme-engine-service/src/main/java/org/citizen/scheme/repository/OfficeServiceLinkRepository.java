package org.citizen.scheme.repository;

import org.citizen.scheme.entity.OfficeServiceLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface OfficeServiceLinkRepository extends JpaRepository<OfficeServiceLink, UUID> {

    @Query("SELECT DISTINCT l.officeId FROM OfficeServiceLink l WHERE l.serviceKey IN :keys")
    List<UUID> findOfficeIdsByServiceKeys(@Param("keys") List<String> keys);

    List<OfficeServiceLink> findByOfficeId(UUID officeId);
}
