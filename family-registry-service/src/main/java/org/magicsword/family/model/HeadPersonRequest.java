package org.magicsword.family.model;

import java.time.LocalDate;

public record HeadPersonRequest(
        String name,
        LocalDate dob,
        String gender,
        String occupation,
        Long annualIncome,
        String casteCategory,
        String mobile,
        String aadhaarRef
) {}
