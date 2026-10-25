package org.citizen.grievance.repository;

import org.citizen.grievance.entity.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
