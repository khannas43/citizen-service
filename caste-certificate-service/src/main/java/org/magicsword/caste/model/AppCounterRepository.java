package org.magicsword.caste.model;

import org.magicsword.caste.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
