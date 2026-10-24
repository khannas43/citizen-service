package org.magicsword.family.repository;

import org.magicsword.family.entity.Person;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PersonRepository extends JpaRepository<Person, UUID> {

    Optional<Person> findByAadhaarRef(String aadhaarRef);
}
