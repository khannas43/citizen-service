package org.citizen.family.model;

import java.time.LocalDate;
import java.util.UUID;

public record PersonSearchCriteria(
        String q,
        String name,
        String aadhaar,
        String mobile,
        LocalDate dob,
        String gender,
        String occupation,
        Long incomeMin,
        Long incomeMax,
        String casteCategory,
        String educationLevel,
        String maritalStatus,
        String employmentStatus,
        String relationship,
        UUID familyId,
        String address,
        String village,
        String taluka,
        String district,
        String state,
        int limit
) {
    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 100;

    public PersonSearchCriteria {
        if (limit <= 0) {
            limit = DEFAULT_LIMIT;
        } else if (limit > MAX_LIMIT) {
            limit = MAX_LIMIT;
        }
    }

    public boolean isEmpty() {
        return isBlank(q)
                && isBlank(name)
                && isBlank(aadhaar)
                && isBlank(mobile)
                && dob == null
                && isBlank(gender)
                && isBlank(occupation)
                && incomeMin == null
                && incomeMax == null
                && isBlank(casteCategory)
                && isBlank(educationLevel)
                && isBlank(maritalStatus)
                && isBlank(employmentStatus)
                && isBlank(relationship)
                && familyId == null
                && isBlank(address)
                && isBlank(village)
                && isBlank(taluka)
                && isBlank(district)
                && isBlank(state);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
