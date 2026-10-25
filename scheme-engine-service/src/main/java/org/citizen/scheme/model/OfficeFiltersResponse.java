package org.citizen.scheme.model;

import org.citizen.scheme.entity.OfficeType;

import java.util.List;
import java.util.Map;

public record OfficeFiltersResponse(
        List<String> districts,
        Map<String, List<String>> talukasByDistrict,
        /** district -> taluka -> villages (or city areas) that have an office. */
        Map<String, Map<String, List<String>>> villagesByTaluka,
        List<OfficeType> officeTypes
) {}
