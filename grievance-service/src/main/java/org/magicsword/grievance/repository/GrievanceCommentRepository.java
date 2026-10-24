package org.magicsword.grievance.repository;

import org.magicsword.grievance.entity.GrievanceComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GrievanceCommentRepository extends JpaRepository<GrievanceComment, UUID> {
    List<GrievanceComment> findByGrievanceIdOrderByCreatedAtAsc(UUID grievanceId);
}
