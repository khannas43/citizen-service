package org.magicsword.scheme.model;

import java.util.List;

public record BeneficiaryGeoOptions(
        List<String> districts,
        List<String> talukas,
        List<String> villages
) {}
