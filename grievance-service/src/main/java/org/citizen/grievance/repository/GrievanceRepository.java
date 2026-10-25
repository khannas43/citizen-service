package org.citizen.grievance.repository;

import org.citizen.grievance.entity.Grievance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GrievanceRepository extends JpaRepository<Grievance, UUID> {
    List<Grievance> findByAadhaarRefOrderByCreatedAtDesc(String aadhaarRef);
    List<Grievance> findByStatusInOrderByCreatedAtDesc(List<String> statuses);
    long countByStatusIn(List<String> statuses);
    long countByStatus(String status);
}
