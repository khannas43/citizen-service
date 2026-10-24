package org.magicsword.marriage.model;

import org.magicsword.marriage.model.AppCounter;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppCounterRepository extends JpaRepository<AppCounter, String> {}
