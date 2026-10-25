package org.citizen.scheme.repository;

import org.citizen.scheme.entity.OfficeType;
import org.citizen.scheme.entity.ServiceOffice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ServiceOfficeRepository extends JpaRepository<ServiceOffice, UUID> {

    List<ServiceOffice> findByIsActiveTrue();

    @Query("SELECT DISTINCT o.district FROM ServiceOffice o WHERE o.isActive = true ORDER BY o.district")
    List<String> findDistinctDistricts();

    @Query("SELECT DISTINCT o.district, o.taluka, o.village FROM ServiceOffice o"
            + " WHERE o.isActive = true AND o.village IS NOT NULL ORDER BY o.district, o.taluka, o.village")
    List<Object[]> findDistinctVillages();

    @Query("SELECT DISTINCT o.taluka FROM ServiceOffice o WHERE o.isActive = true AND o.district = :district ORDER BY o.taluka")
    List<String> findDistinctTalukas(@Param("district") String district);

    @Query("SELECT o FROM ServiceOffice o WHERE o.isActive = true AND o.district = :district"
            + " AND (:taluka IS NULL OR o.taluka = :taluka)"
            // Most offices serve a whole taluka and carry no village, so a village choice must not exclude them.
            + " AND (:village IS NULL OR o.village IS NULL OR o.village = :village)"
            + " AND (:typesEmpty = true OR o.officeType IN :types)"
            + " AND (:officeIdsEmpty = true OR o.id IN :officeIds)"
            + " ORDER BY o.name")
    List<ServiceOffice> filterByGeo(
            @Param("district") String district,
            @Param("taluka") String taluka,
            @Param("village") String village,
            @Param("typesEmpty") boolean typesEmpty,
            @Param("types") List<OfficeType> types,
            @Param("officeIdsEmpty") boolean officeIdsEmpty,
            @Param("officeIds") List<UUID> officeIds);

    @Query("SELECT o FROM ServiceOffice o WHERE o.isActive = true"
            + " AND (:typesEmpty = true OR o.officeType IN :types)"
            + " AND (:officeIdsEmpty = true OR o.id IN :officeIds)")
    List<ServiceOffice> findActiveForNearby(
            @Param("typesEmpty") boolean typesEmpty,
            @Param("types") List<OfficeType> types,
            @Param("officeIdsEmpty") boolean officeIdsEmpty,
            @Param("officeIds") List<UUID> officeIds);
}
