package org.magicsword.scheme.repository;

import org.magicsword.scheme.entity.Beneficiary;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BeneficiaryRepository extends JpaRepository<Beneficiary, UUID> {

    List<Beneficiary> findBySchemeId(UUID schemeId);

    List<Beneficiary> findBySchemeIdAndFamilyIdAndStatusIn(UUID schemeId, String familyId, Collection<String> statuses);

    boolean existsBySchemeIdAndFamilyIdAndStatusIn(UUID schemeId, String familyId, Collection<String> statuses);

    List<Beneficiary> findByFamilyIdAndPersonIdAndStatusIn(String familyId, String personId, Collection<String> statuses);

    List<Beneficiary> findByFamilyIdAndStatusIn(String familyId, Collection<String> statuses);

    List<Beneficiary> findBySchemeIdAndStatusIn(UUID schemeId, Collection<String> statuses);

    List<Beneficiary> findByStatusIn(Collection<String> statuses);

    /** Fraud-scan query: returns only ACTIVE/CONFIRMED + explicitly listed hero families. */
    @Query(value = """
            SELECT * FROM scheme_engine.beneficiary
            WHERE status NOT IN ('REMOVED')
              AND (status IN ('ACTIVE','CONFIRMED')
                   OR family_id IN :heroFamilyIds)
            """, nativeQuery = true)
    List<Beneficiary> findFraudCandidates(@Param("heroFamilyIds") Collection<String> heroFamilyIds);

    @Query("""
            SELECT b FROM Beneficiary b
            WHERE b.schemeId = :schemeId
              AND b.status <> 'REMOVED'
              AND (:district IS NULL OR :district = '' OR b.familyDistrict = :district
                   OR (:district = 'Unknown' AND b.familyDistrict IS NULL))
              AND (:taluka IS NULL OR :taluka = '' OR b.familyTaluka = :taluka
                   OR (:taluka = 'Unknown' AND b.familyTaluka IS NULL))
              AND (:search IS NULL OR :search = '' OR
                   LOWER(b.personName) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(b.familyVillage, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(b.familyDistrict, '')) LIKE LOWER(CONCAT('%', :search, '%')))
            ORDER BY b.identifiedAt DESC NULLS LAST, b.personName ASC
            """)
    List<Beneficiary> searchCitizens(
            @Param("schemeId") UUID schemeId,
            @Param("district") String district,
            @Param("taluka") String taluka,
            @Param("search") String search,
            Pageable pageable);

    @Query("""
            SELECT COUNT(b) FROM Beneficiary b
            WHERE b.schemeId = :schemeId
              AND b.status <> 'REMOVED'
              AND (:district IS NULL OR :district = '' OR b.familyDistrict = :district
                   OR (:district = 'Unknown' AND b.familyDistrict IS NULL))
              AND (:taluka IS NULL OR :taluka = '' OR b.familyTaluka = :taluka
                   OR (:taluka = 'Unknown' AND b.familyTaluka IS NULL))
              AND (:search IS NULL OR :search = '' OR
                   LOWER(b.personName) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(b.familyVillage, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
                   LOWER(COALESCE(b.familyDistrict, '')) LIKE LOWER(CONCAT('%', :search, '%')))
            """)
    long countCitizens(
            @Param("schemeId") UUID schemeId,
            @Param("district") String district,
            @Param("taluka") String taluka,
            @Param("search") String search);

    @Query(value = """
            SELECT scheme_id, status, COUNT(*)
            FROM scheme_engine.beneficiary
            GROUP BY scheme_id, status
            """, nativeQuery = true)
    List<Object[]> countGroupedBySchemeAndStatus();

    @Query(value = """
            SELECT COALESCE(caste_category, 'GENERAL'),
                   COALESCE(family_district, 'Unknown'),
                   gender,
                   COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
            GROUP BY caste_category, family_district, gender
            """, nativeQuery = true)
    List<Object[]> countDistributionByScheme(@Param("schemeId") UUID schemeId);

    @Query(value = """
            SELECT COALESCE(family_district, 'Unknown'),
                   COALESCE(family_taluka, 'Unknown'),
                   COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
            GROUP BY COALESCE(family_district, 'Unknown'), COALESCE(family_taluka, 'Unknown')
            """, nativeQuery = true)
    List<Object[]> aggregateDistrictTaluka(@Param("schemeId") UUID schemeId);

    @Query(value = """
            SELECT COALESCE(family_district, 'Unknown'),
                   COALESCE(family_taluka, 'Unknown'),
                   COALESCE(family_village, 'Unknown'),
                   COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
            GROUP BY COALESCE(family_district, 'Unknown'),
                     COALESCE(family_taluka, 'Unknown'),
                     COALESCE(family_village, 'Unknown')
            ORDER BY COUNT(*) DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Object[]> aggregateTopVillages(@Param("schemeId") UUID schemeId, @Param("limit") int limit);

    @Query(value = """
            SELECT COALESCE(family_district, 'Unknown'), COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
            GROUP BY COALESCE(family_district, 'Unknown')
            """, nativeQuery = true)
    List<Object[]> aggregateDistricts(@Param("schemeId") UUID schemeId);

    @Query(value = """
            SELECT COALESCE(family_taluka, 'Unknown'), COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
              AND COALESCE(family_district, 'Unknown') = :district
            GROUP BY COALESCE(family_taluka, 'Unknown')
            """, nativeQuery = true)
    List<Object[]> aggregateTalukas(@Param("schemeId") UUID schemeId, @Param("district") String district);

    @Query(value = """
            SELECT COALESCE(family_village, 'Unknown'), COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status <> 'REMOVED'
              AND COALESCE(family_district, 'Unknown') = :district
              AND COALESCE(family_taluka, 'Unknown') = :taluka
            GROUP BY COALESCE(family_village, 'Unknown')
            """, nativeQuery = true)
    List<Object[]> aggregateVillages(
            @Param("schemeId") UUID schemeId,
            @Param("district") String district,
            @Param("taluka") String taluka);

    @Query(value = """
            SELECT status, COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND (:district IS NULL OR COALESCE(family_district, 'Unknown') = :district)
            GROUP BY status
            """, nativeQuery = true)
    List<Object[]> countByStatusForScheme(@Param("schemeId") UUID schemeId, @Param("district") String district);

    @Query(value = """
            SELECT COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE scheme_id = :schemeId
              AND status = 'CONFIRMED'
              AND (disbursement_status IS NULL OR disbursement_status <> 'DISBURSED')
              AND (:district IS NULL OR COALESCE(family_district, 'Unknown') = :district)
            """, nativeQuery = true)
    long countDisbursableByScheme(@Param("schemeId") UUID schemeId, @Param("district") String district);

    @Query(value = """
            SELECT status, COUNT(*)
            FROM scheme_engine.beneficiary
            GROUP BY status
            """, nativeQuery = true)
    List<Object[]> countGroupedByStatus();

    @Query(value = """
            SELECT COUNT(*)
            FROM scheme_engine.beneficiary
            WHERE status = 'REMOVED'
              AND (
                UPPER(COALESCE(removal_reason, '')) LIKE '%AUTO%'
                OR UPPER(COALESCE(removal_reason, '')) LIKE '%DECEASED%'
                OR UPPER(COALESCE(removal_reason, '')) LIKE '%INCOME%'
                OR UPPER(COALESCE(removal_reason, '')) LIKE 'MEMBER_%'
              )
            """, nativeQuery = true)
    long countAutoRemoved();
}
