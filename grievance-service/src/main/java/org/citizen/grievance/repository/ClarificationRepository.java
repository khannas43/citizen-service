package org.citizen.grievance.repository;

import org.citizen.grievance.entity.Clarification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ClarificationRepository extends JpaRepository<Clarification, UUID> {
    List<Clarification> findByAadhaarRefOrderByAskedAtDesc(String aadhaarRef);
    List<Clarification> findByApplicationRefOrderByAskedAtDesc(String applicationRef);
    List<Clarification> findByDisplayRefOrderByAskedAtDesc(String displayRef);
    List<Clarification> findByStatusAndDirectionOrderByAskedAtAsc(String status, String direction);
    List<Clarification> findByDirectionAndStatusOrderByAnsweredAtDesc(String direction, String status);
}
