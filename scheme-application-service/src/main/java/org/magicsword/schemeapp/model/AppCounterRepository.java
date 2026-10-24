package org.magicsword.schemeapp.model;

import org.magicsword.schemeapp.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
