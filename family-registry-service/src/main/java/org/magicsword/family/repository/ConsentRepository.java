package org.magicsword.family.repository;

import org.magicsword.family.entity.Consent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ConsentRepository extends JpaRepository<Consent, UUID> {
    List<Consent> findByAadhaarRefOrderByGrantedAtDesc(String aadhaarRef);
}
