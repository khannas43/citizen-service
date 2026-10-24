package org.magicsword.familymember.model;

import org.magicsword.familymember.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
