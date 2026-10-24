package org.magicsword.family.model;

public record CreateFamilyRequest(
        String address,
        String village,
        String taluka,
        String district,
        HeadPersonRequest headPerson
) {}
