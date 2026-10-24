package org.magicsword.grievance.repository;

import org.magicsword.grievance.entity.GrievanceAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GrievanceAttachmentRepository extends JpaRepository<GrievanceAttachment, UUID> {
    List<GrievanceAttachment> findByGrievanceIdOrderByCreatedAtAsc(UUID grievanceId);
}
