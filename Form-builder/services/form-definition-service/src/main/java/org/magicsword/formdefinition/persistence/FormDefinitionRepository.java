package org.magicsword.formdefinition.persistence;

import java.util.List;

import org.magicsword.formdefinition.domain.FormDefinitionEntity;
import org.magicsword.formdefinition.domain.FormDefinitionId;
import org.magicsword.formdefinition.governance.FormDefinitionGovernanceQueueItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FormDefinitionRepository extends JpaRepository<FormDefinitionEntity, FormDefinitionId> {

    /**
     * Highest published/retired row for a service (release head candidates). Pass {@code Pageable} of
     * size 1 ordered by version DESC.
     */
    @Query(
            """
            SELECT e FROM FormDefinitionEntity e
            WHERE e.id.serviceId = :serviceId
              AND (e.status = org.magicsword.formdefinition.domain.FormDefinitionStatus.published
                   OR e.status = org.magicsword.formdefinition.domain.FormDefinitionStatus.retired)
            ORDER BY e.id.version DESC
            """)
    List<FormDefinitionEntity> findReleaseHeads(
            @Param("serviceId") String serviceId, Pageable pageable);

    /**
     * Bounded ascending version metadata listing. {@code afterVersion} is exclusive (use {@code 0} to
     * start before the first version).
     */
    @Query(
            """
            SELECT e FROM FormDefinitionEntity e
            WHERE e.id.serviceId = :serviceId
              AND e.id.version > :afterVersion
            ORDER BY e.id.version ASC
            """)
    List<FormDefinitionEntity> findVersionsAfter(
            @Param("serviceId") String serviceId,
            @Param("afterVersion") int afterVersion,
            Pageable pageable);

    /**
     * Bounded ascending governance queue metadata (FB-E1). Statuses submitted|approved only.
     * Keyset: rows strictly after {@code (afterServiceId, afterVersion)} when {@code hasCursor} is
     * true; otherwise from the start. Does not select JSONB definition bodies.
     */
    @Query(
            """
            SELECT new org.magicsword.formdefinition.governance.FormDefinitionGovernanceQueueItem(
                e.id.serviceId, e.id.version, e.status)
            FROM FormDefinitionEntity e
            WHERE (e.status = org.magicsword.formdefinition.domain.FormDefinitionStatus.submitted
                   OR e.status = org.magicsword.formdefinition.domain.FormDefinitionStatus.approved)
              AND (
                   :hasCursor = false
                   OR e.id.serviceId > :afterServiceId
                   OR (e.id.serviceId = :afterServiceId AND e.id.version > :afterVersion)
                  )
            ORDER BY e.id.serviceId ASC, e.id.version ASC
            """)
    List<FormDefinitionGovernanceQueueItem> findGovernanceQueueAfter(
            @Param("hasCursor") boolean hasCursor,
            @Param("afterServiceId") String afterServiceId,
            @Param("afterVersion") int afterVersion,
            Pageable pageable);
}
