package org.citizen.family.model;

public record CreateFamilyRequest(
        String address,
        String village,
        String taluka,
        String district,
        HeadPersonRequest headPerson
) {}
