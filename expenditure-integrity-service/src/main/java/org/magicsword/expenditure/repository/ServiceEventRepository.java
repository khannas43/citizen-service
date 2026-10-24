package org.magicsword.expenditure.repository;

import org.magicsword.expenditure.entity.ServiceEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ServiceEventRepository extends JpaRepository<ServiceEvent, UUID> {
    List<ServiceEvent> findByEmployeeCode(String employeeCode);
}
