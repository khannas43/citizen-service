package org.citizen.expenditure.repository;

import org.citizen.expenditure.entity.VerificationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VerificationEventRepository extends JpaRepository<VerificationEvent, UUID> {
    List<VerificationEvent> findByPersonId(String personId);

    List<VerificationEvent> findByPersonIdIn(java.util.Collection<String> personIds);

    boolean existsByPersonIdAndEventTypeAndEventDate(String personId, String eventType, LocalDate eventDate);

    Optional<VerificationEvent> findFirstByCreatedAtIsNotNullOrderByCreatedAtDesc();
}
