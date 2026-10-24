package org.magicsword.scheme.model;

import org.magicsword.scheme.entity.SchemeBenefitComponent;

public record SchemeBenefitComponentDTO(
        String courseCategory,
        Long tuitionAmount,
        Long boardingAmount,
        Long booksAmount
) {
    public static SchemeBenefitComponentDTO from(SchemeBenefitComponent c) {
        return new SchemeBenefitComponentDTO(
                c.getCourseCategory(), c.getTuitionAmount(), c.getBoardingAmount(), c.getBooksAmount());
    }
}
