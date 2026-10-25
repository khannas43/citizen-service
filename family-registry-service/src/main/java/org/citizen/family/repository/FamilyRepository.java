package org.citizen.family.repository;

import org.citizen.family.entity.Family;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface FamilyRepository extends JpaRepository<Family, UUID> {

    @Query("SELECT f.id FROM Family f ORDER BY f.id")
    List<UUID> findIdsPage(Pageable pageable);

    @Query(value = """
            SELECT DISTINCT f.taluka
            FROM family_registry.family f
            WHERE lower(trim(COALESCE(f.district, ''))) = lower(trim(:district))
              AND f.taluka IS NOT NULL
              AND trim(f.taluka) <> ''
            ORDER BY f.taluka
            """, nativeQuery = true)
    List<String> findDistinctTalukasByDistrict(@Param("district") String district);

    @Query(value = """
            SELECT DISTINCT f.village
            FROM family_registry.family f
            WHERE lower(trim(COALESCE(f.district, ''))) = lower(trim(:district))
              AND lower(trim(COALESCE(f.taluka, ''))) = lower(trim(:taluka))
              AND f.village IS NOT NULL
              AND trim(f.village) <> ''
            ORDER BY f.village
            """, nativeQuery = true)
    List<String> findDistinctVillagesByDistrictAndTaluka(
            @Param("district") String district,
            @Param("taluka") String taluka);
}
