package org.citizen.family.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.citizen.family.model.PersonSearchCriteria;
import org.citizen.family.model.PersonSearchResponse;
import org.citizen.family.model.PersonSummary;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public class PersonSearchDao {

  private static final String SEARCH_SQL = """
      SELECT
          p.id,
          f.id AS family_id,
          p.name,
          p.dob,
          p.gender,
          p.occupation,
          p.annual_income,
          p.caste_category,
          p.is_alive,
          p.mobile,
          p.aadhaar_ref,
          fm.relationship_to_head,
          p.education_level,
          p.marital_status,
          p.employment_status,
          f.village,
          f.taluka,
          f.district,
          p.onboarding_completed,
          p.exam_type,
          p.exam_percentile,
          p.course_category,
          COUNT(*) OVER() AS total_matched
      FROM family_registry.person p
      INNER JOIN family_registry.family_member fm ON fm.person_id = p.id
      INNER JOIN family_registry.family f ON f.id = fm.family_id
      WHERE 1 = 1
        AND (CAST(:q AS text) IS NULL OR CAST(:q AS text) = '' OR (
              lower(p.name) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(p.aadhaar_ref) LIKE lower(CAST(:q AS text) || '%')
           OR lower(COALESCE(p.mobile, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(p.occupation, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(f.village) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(f.taluka) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(f.district) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(f.address, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(p.caste_category, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(p.education_level, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(p.marital_status, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(p.employment_status, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR lower(COALESCE(fm.relationship_to_head, '')) LIKE lower('%' || CAST(:q AS text) || '%')
           OR (CAST(:qFamilyId AS text) IS NOT NULL AND f.id = CAST(:qFamilyId AS uuid))
        ))
        AND (CAST(:name AS text) IS NULL OR CAST(:name AS text) = ''
             OR lower(p.name) LIKE lower('%' || CAST(:name AS text) || '%'))
        AND (CAST(:aadhaar AS text) IS NULL OR CAST(:aadhaar AS text) = ''
             OR p.aadhaar_ref = CAST(:aadhaar AS text))
        AND (CAST(:mobile AS text) IS NULL OR CAST(:mobile AS text) = ''
             OR lower(COALESCE(p.mobile, '')) LIKE lower('%' || CAST(:mobile AS text) || '%'))
        AND (CAST(:dob AS date) IS NULL OR p.dob = CAST(:dob AS date))
        AND (CAST(:gender AS text) IS NULL OR CAST(:gender AS text) = '' OR p.gender = CAST(:gender AS text))
        AND (CAST(:occupation AS text) IS NULL OR CAST(:occupation AS text) = ''
             OR lower(COALESCE(p.occupation, '')) LIKE lower('%' || CAST(:occupation AS text) || '%'))
        AND (CAST(:incomeMin AS bigint) IS NULL OR p.annual_income >= CAST(:incomeMin AS bigint))
        AND (CAST(:incomeMax AS bigint) IS NULL OR p.annual_income <= CAST(:incomeMax AS bigint))
        AND (CAST(:casteCategory AS text) IS NULL OR CAST(:casteCategory AS text) = ''
             OR upper(p.caste_category) = upper(CAST(:casteCategory AS text)))
        AND (CAST(:educationLevel AS text) IS NULL OR CAST(:educationLevel AS text) = ''
             OR upper(p.education_level) = upper(CAST(:educationLevel AS text)))
        AND (CAST(:maritalStatus AS text) IS NULL OR CAST(:maritalStatus AS text) = ''
             OR upper(p.marital_status) = upper(CAST(:maritalStatus AS text)))
        AND (CAST(:employmentStatus AS text) IS NULL OR CAST(:employmentStatus AS text) = ''
             OR upper(p.employment_status) = upper(CAST(:employmentStatus AS text)))
        AND (CAST(:relationship AS text) IS NULL OR CAST(:relationship AS text) = ''
             OR upper(fm.relationship_to_head) = upper(CAST(:relationship AS text)))
        AND (CAST(:familyId AS uuid) IS NULL OR f.id = CAST(:familyId AS uuid))
        AND (CAST(:address AS text) IS NULL OR CAST(:address AS text) = ''
             OR lower(COALESCE(f.address, '')) LIKE lower('%' || CAST(:address AS text) || '%'))
        AND (CAST(:village AS text) IS NULL OR CAST(:village AS text) = ''
             OR lower(f.village) LIKE lower('%' || CAST(:village AS text) || '%'))
        AND (CAST(:taluka AS text) IS NULL OR CAST(:taluka AS text) = ''
             OR lower(f.taluka) LIKE lower('%' || CAST(:taluka AS text) || '%'))
        AND (CAST(:district AS text) IS NULL OR CAST(:district AS text) = ''
             OR lower(f.district) LIKE lower('%' || CAST(:district AS text) || '%'))
        AND (CAST(:state AS text) IS NULL OR CAST(:state AS text) = ''
             OR lower(COALESCE(f.state, '')) LIKE lower('%' || CAST(:state AS text) || '%'))
      ORDER BY p.name
      LIMIT :limit
      """;

  @PersistenceContext
  private EntityManager entityManager;

  @SuppressWarnings("unchecked")
  public PersonSearchResponse search(PersonSearchCriteria criteria) {
    Query query = entityManager.createNativeQuery(SEARCH_SQL);
    bindCriteria(query, criteria);

    List<Object[]> rows = query.getResultList();
    if (rows.isEmpty()) {
      return PersonSearchResponse.empty(criteria.limit());
    }

    long totalMatched = toLong(rows.get(0)[22]);
    List<PersonSummary> results = rows.stream()
        .map(this::toPersonSummary)
        .toList();

    boolean limited = totalMatched > results.size();
    return new PersonSearchResponse(results, totalMatched, limited, criteria.limit());
  }

  private void bindCriteria(Query query, PersonSearchCriteria criteria) {
    String qFamilyId = null;
    if (criteria.q() != null && !criteria.q().isBlank()) {
      try {
        UUID.fromString(criteria.q().trim());
        qFamilyId = criteria.q().trim();
      } catch (IllegalArgumentException ignored) {
        // not a UUID — cross-field text search only
      }
    }

    query.setParameter("q", blankToNull(criteria.q()));
    query.setParameter("qFamilyId", qFamilyId);
    query.setParameter("name", blankToNull(criteria.name()));
    query.setParameter("aadhaar", blankToNull(criteria.aadhaar()));
    query.setParameter("mobile", blankToNull(criteria.mobile()));
    query.setParameter("dob", criteria.dob() != null ? Date.valueOf(criteria.dob()) : null);
    query.setParameter("gender", normalizeGenderFilter(criteria.gender()));
    query.setParameter("occupation", blankToNull(criteria.occupation()));
    query.setParameter("incomeMin", criteria.incomeMin());
    query.setParameter("incomeMax", criteria.incomeMax());
    query.setParameter("casteCategory", blankToNull(criteria.casteCategory()));
    query.setParameter("educationLevel", blankToNull(criteria.educationLevel()));
    query.setParameter("maritalStatus", blankToNull(criteria.maritalStatus()));
    query.setParameter("employmentStatus", blankToNull(criteria.employmentStatus()));
    query.setParameter("relationship", blankToNull(criteria.relationship()));
    query.setParameter("familyId", criteria.familyId());
    query.setParameter("address", blankToNull(criteria.address()));
    query.setParameter("village", blankToNull(criteria.village()));
    query.setParameter("taluka", blankToNull(criteria.taluka()));
    query.setParameter("district", blankToNull(criteria.district()));
    query.setParameter("state", blankToNull(criteria.state()));
    query.setParameter("limit", criteria.limit());
  }

  private PersonSummary toPersonSummary(Object[] row) {
    return new PersonSummary(
        (UUID) row[0],
        (UUID) row[1],
        (String) row[2],
        toLocalDate(row[3]),
        (String) row[4],
        (String) row[5],
        toLong(row[6]),
        (String) row[7],
        (Boolean) row[8],
        (String) row[9],
        (String) row[10],
        (String) row[11],
        (String) row[12],
        (String) row[13],
        (String) row[14],
        (String) row[15],
        (String) row[16],
        (String) row[17],
        (Boolean) row[18],
        (String) row[19],
        toDouble(row[20]),
        (String) row[21]
    );
  }

  private LocalDate toLocalDate(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof LocalDate localDate) {
      return localDate;
    }
    if (value instanceof Date sqlDate) {
      return sqlDate.toLocalDate();
    }
    if (value instanceof java.util.Date utilDate) {
      return new Date(utilDate.getTime()).toLocalDate();
    }
    return LocalDate.parse(value.toString());
  }

  private Long toLong(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Long longValue) {
      return longValue;
    }
    if (value instanceof Integer intValue) {
      return intValue.longValue();
    }
    if (value instanceof Number number) {
      return number.longValue();
    }
    return Long.parseLong(value.toString());
  }

  private Double toDouble(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Double doubleValue) {
      return doubleValue;
    }
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    return Double.parseDouble(value.toString());
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  /** DB stores M/F; UI may send Male/Female. */
  private String normalizeGenderFilter(String gender) {
    if (gender == null || gender.isBlank()) {
      return null;
    }
    return switch (gender.trim().toUpperCase()) {
      case "M", "MALE" -> "M";
      case "F", "FEMALE" -> "F";
      default -> gender.trim();
    };
  }
}
