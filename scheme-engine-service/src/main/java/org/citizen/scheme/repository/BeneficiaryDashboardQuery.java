package org.citizen.scheme.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.citizen.scheme.entity.Beneficiary;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Repository
public class BeneficiaryDashboardQuery {

    private static final String AUTO_REMOVAL_SQL = """
            b.status = 'REMOVED'
            AND (
              UPPER(COALESCE(b.removal_reason, '')) LIKE '%AUTO%'
              OR UPPER(COALESCE(b.removal_reason, '')) LIKE '%DECEASED%'
              OR UPPER(COALESCE(b.removal_reason, '')) LIKE '%INCOME%'
              OR UPPER(COALESCE(b.removal_reason, '')) LIKE 'MEMBER_%'
            )
            """;

    @PersistenceContext
    private EntityManager em;

    public record SearchResult(List<Beneficiary> rows, long total) {}

    public SearchResult search(
            UUID schemeId,
            String status,
            String search,
            String district,
            String taluka,
            String village,
            boolean autoRemovalsOnly,
            String sortBy,
            String sortDir,
            int offset,
            int limit) {

        FilterClause filter = buildFilter(schemeId, status, search, district, taluka, village, autoRemovalsOnly);
        String orderBy = buildOrderBy(sortBy, sortDir);

        String fromJoin = """
                FROM scheme_engine.beneficiary b
                LEFT JOIN scheme_engine.scheme s ON s.id = b.scheme_id
                """;

        String dataSql = "SELECT b.* " + fromJoin + filter.whereSql + " ORDER BY " + orderBy;
        Query dataQuery = em.createNativeQuery(dataSql, Beneficiary.class);
        bindParams(dataQuery, filter.params);
        dataQuery.setFirstResult(offset);
        dataQuery.setMaxResults(limit);

        @SuppressWarnings("unchecked")
        List<Beneficiary> rows = dataQuery.getResultList();

        String countSql = "SELECT COUNT(*) " + fromJoin + filter.whereSql;
        Query countQuery = em.createNativeQuery(countSql);
        bindParams(countQuery, filter.params);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        return new SearchResult(rows, total);
    }

    public List<String> distinctDistricts(UUID schemeId) {
        return distinctColumn("family_district", schemeId, null, null);
    }

    public List<String> distinctTalukas(UUID schemeId, String district) {
        return distinctColumn("family_taluka", schemeId, district, null);
    }

    public List<String> distinctVillages(UUID schemeId, String district, String taluka) {
        return distinctColumn("family_village", schemeId, district, taluka);
    }

    @Transactional
    public int backfillGeographyFromFamilyRegistry() {
        return em.createNativeQuery("""
                UPDATE scheme_engine.beneficiary b
                SET family_district = f.district,
                    family_taluka = f.taluka,
                    family_village = COALESCE(b.family_village, f.village)
                FROM family_registry.family f
                WHERE b.family_id = f.id::text
                  AND (b.family_district IS NULL OR b.family_taluka IS NULL
                       OR b.family_district = '' OR b.family_taluka = '')
                """).executeUpdate();
    }

    private List<String> distinctColumn(String column, UUID schemeId, String district, String taluka) {
        FilterClause base = buildFilter(schemeId, "", "", district, taluka, "", false);
        String sql = """
                SELECT DISTINCT COALESCE(b.%s, 'Unknown') AS val
                FROM scheme_engine.beneficiary b
                %s
                ORDER BY val ASC
                """.formatted(column, base.whereSql);

        Query q = em.createNativeQuery(sql);
        bindParams(q, base.params);
        @SuppressWarnings("unchecked")
        List<String> raw = q.getResultList();
        return raw.stream()
                .filter(Objects::nonNull)
                .map(Object::toString)
                .filter(v -> !v.isBlank() && !"Unknown".equalsIgnoreCase(v))
                .toList();
    }

    private record FilterClause(String whereSql, Map<String, Object> params) {}

    private FilterClause buildFilter(
            UUID schemeId,
            String status,
            String search,
            String district,
            String taluka,
            String village,
            boolean autoRemovalsOnly) {

        StringBuilder where = new StringBuilder(" WHERE 1=1 ");
        Map<String, Object> params = new HashMap<>();

        if (schemeId != null) {
            where.append(" AND b.scheme_id = :schemeId ");
            params.put("schemeId", schemeId);
        }
        if (autoRemovalsOnly) {
            where.append(" AND ").append(AUTO_REMOVAL_SQL).append(' ');
        } else if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
            String trimmed = status.trim();
            if ("ACTIVE".equalsIgnoreCase(trimmed)) {
                // The confirm/disburse workflow never writes the literal "ACTIVE" status —
                // dashboards treat CONFIRMED as the active state, so the filter must match that.
                where.append(" AND b.status IN ('ACTIVE', 'CONFIRMED') ");
            } else {
                where.append(" AND b.status = :status ");
                params.put("status", trimmed);
            }
        }
        if (search != null && !search.isBlank()) {
            where.append("""
                     AND (
                       LOWER(b.person_name) LIKE LOWER(CONCAT('%', :search, '%'))
                       OR LOWER(COALESCE(b.family_village, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                       OR LOWER(COALESCE(b.family_district, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                       OR LOWER(COALESCE(b.family_taluka, '')) LIKE LOWER(CONCAT('%', :search, '%'))
                     )
                    """);
            params.put("search", search.trim());
        }
        if (district != null && !district.isBlank()) {
            where.append(" AND COALESCE(b.family_district, 'Unknown') = :district ");
            params.put("district", district.trim());
        }
        if (taluka != null && !taluka.isBlank()) {
            where.append(" AND COALESCE(b.family_taluka, 'Unknown') = :taluka ");
            params.put("taluka", taluka.trim());
        }
        if (village != null && !village.isBlank()) {
            where.append(" AND COALESCE(b.family_village, 'Unknown') = :village ");
            params.put("village", village.trim());
        }

        return new FilterClause(where.toString(), params);
    }

    private String buildOrderBy(String sortBy, String sortDir) {
        boolean asc = "asc".equalsIgnoreCase(sortDir);
        String dir = asc ? "ASC" : "DESC";
        String nulls = asc ? "NULLS FIRST" : "NULLS LAST";
        String tie = ", b.person_name ASC";

        return switch (sortBy == null ? "recent" : sortBy.toLowerCase()) {
            case "name" -> "b.person_name " + dir + tie;
            case "scheme" -> "s.name " + dir + " NULLS LAST" + tie;
            case "district" -> "b.family_district " + dir + " " + nulls + tie;
            case "taluka" -> "b.family_taluka " + dir + " " + nulls + tie;
            case "village" -> "b.family_village " + dir + " " + nulls + tie;
            case "status" -> "b.status " + dir + tie;
            case "identified" -> "b.identified_at " + dir + " " + nulls + tie;
            case "removed" -> "b.removed_at " + dir + " " + nulls + tie;
            default -> "COALESCE(b.removed_at, b.confirmed_at, b.identified_at) DESC NULLS LAST" + tie;
        };
    }

    private void bindParams(Query query, Map<String, Object> params) {
        params.forEach(query::setParameter);
    }
}
