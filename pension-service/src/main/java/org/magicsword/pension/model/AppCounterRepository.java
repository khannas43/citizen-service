package org.magicsword.pension.model;

import org.magicsword.pension.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
