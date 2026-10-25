package org.citizen.scheme.repository;

import org.citizen.scheme.entity.GeoCentroid;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GeoCentroidRepository extends JpaRepository<GeoCentroid, String> {}
