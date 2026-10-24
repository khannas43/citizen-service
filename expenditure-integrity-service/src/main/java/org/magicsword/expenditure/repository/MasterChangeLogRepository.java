package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.MasterChangeLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface MasterChangeLogRepository extends JpaRepository<MasterChangeLog, UUID> {
    List<MasterChangeLog> findByPersonId(String personId);
}
