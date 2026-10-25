package org.citizen.scheme.service;

import org.citizen.scheme.entity.OfficeType;
import org.citizen.scheme.entity.Scheme;
import org.citizen.scheme.repository.OfficeServiceLinkRepository;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class OfficeResolutionService {

    static final String SCHEME_PREFIX = "SCHEME:";
    static final String DEPT_PREFIX = "DEPARTMENT:";
    static final String CATEGORY_PREFIX = "CATEGORY:";

    private final OfficeServiceLinkRepository linkRepository;

    public OfficeResolutionService(OfficeServiceLinkRepository linkRepository) {
        this.linkRepository = linkRepository;
    }

    /**
     * Resolve office IDs for a scheme: explicit scheme link → department link → category default types.
     */
    public Optional<Set<UUID>> resolveOfficeIdsForScheme(Scheme scheme) {
        if (scheme == null) return Optional.empty();

        List<String> keys = new ArrayList<>();
        keys.add(SCHEME_PREFIX + scheme.getId());

        if (scheme.getDepartment() != null && !scheme.getDepartment().isBlank()) {
            keys.add(DEPT_PREFIX + scheme.getDepartment().trim());
        }
        if (scheme.getCategory() != null && !scheme.getCategory().isBlank()) {
            for (OfficeType type : categoryDefaultTypes(scheme.getCategory())) {
                keys.add(CATEGORY_PREFIX + scheme.getCategory().trim() + ":" + type.name());
            }
        }

        for (String key : keys) {
            List<UUID> ids = linkRepository.findOfficeIdsByServiceKeys(List.of(key));
            if (!ids.isEmpty()) {
                return Optional.of(new LinkedHashSet<>(ids));
            }
        }
        return Optional.empty();
    }

    static List<OfficeType> categoryDefaultTypes(String category) {
        if (category == null) return List.of(OfficeType.JAN_SEVA_KENDRA, OfficeType.MAMLATDAR);
        return switch (category.trim().toLowerCase(Locale.ROOT)) {
            case "pension", "social welfare" -> List.of(
                    OfficeType.JAN_SEVA_KENDRA, OfficeType.MAMLATDAR, OfficeType.DISTRICT_COLLECTORATE);
            case "agriculture" -> List.of(
                    OfficeType.TALUKA_PANCHAYAT, OfficeType.MAMLATDAR, OfficeType.JAN_SEVA_KENDRA);
            case "education", "scholarship" -> List.of(
                    OfficeType.DEPARTMENT_OFFICE, OfficeType.DISTRICT_COLLECTORATE, OfficeType.JAN_SEVA_KENDRA);
            default -> List.of(OfficeType.JAN_SEVA_KENDRA, OfficeType.MAMLATDAR, OfficeType.DISTRICT_COLLECTORATE);
        };
    }

    public static String deptKey(String department) {
        return DEPT_PREFIX + department.trim();
    }

    public static String schemeKey(UUID schemeId) {
        return SCHEME_PREFIX + schemeId;
    }

    public static String categoryKey(String category, OfficeType type) {
        return CATEGORY_PREFIX + category.trim() + ":" + type.name();
    }
}
