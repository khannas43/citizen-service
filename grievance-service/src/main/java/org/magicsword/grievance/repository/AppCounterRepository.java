package org.magicsword.grievance.repository;

import org.magicsword.grievance.entity.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
