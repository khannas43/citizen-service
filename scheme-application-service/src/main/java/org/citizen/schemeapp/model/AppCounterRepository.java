package org.citizen.schemeapp.model;

import org.citizen.schemeapp.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
