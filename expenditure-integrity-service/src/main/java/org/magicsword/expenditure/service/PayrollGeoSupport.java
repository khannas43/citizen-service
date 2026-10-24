package org.magicsword.expenditure.service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Maps generated payroll employee codes (GJ-BAN-DEESA-01) back to district/taluka when master rows lack geo. */
final class PayrollGeoSupport {

    private static final Map<String, String[]> PREFIX_TO_GEO = buildPrefixMap();

    private PayrollGeoSupport() {}

    record Geo(String district, String taluka) {}

    static Optional<Geo> inferFromEmployeeCode(String employeeCode) {
        if (employeeCode == null || employeeCode.isBlank()) {
            return Optional.empty();
        }
        String code = employeeCode.trim().toUpperCase(Locale.ROOT);
        return PREFIX_TO_GEO.entrySet().stream()
                .filter(e -> code.startsWith(e.getKey()))
                .findFirst()
                .map(e -> new Geo(e.getValue()[0], e.getValue()[1]));
    }

    private static Map<String, String[]> buildPrefixMap() {
        String[][] pilot = {
                {"Banaskantha", "Deesa"},
                {"Banaskantha", "Palanpur"},
                {"Ahmedabad", "Dholka"},
                {"Ahmedabad", "Sanand"},
                {"Ahmedabad", "Viramgam"},
                {"Ahmedabad", "Ahmedabad City"},
                {"Ahmedabad", "Bavla"},
                {"Ahmedabad", "Naroda"},
                {"Surat", "Choryasi"},
                {"Surat", "Katargam"},
                {"Surat", "Olpad"},
                {"Surat", "Surat City"},
                {"Surat", "Bardoli"},
        };
        Map<String, String[]> out = new LinkedHashMap<>();
        for (String[] row : pilot) {
            String prefix = "GJ-" + slug(row[0]).substring(0, Math.min(3, slug(row[0]).length()))
                    + "-" + slug(row[1]).substring(0, Math.min(6, slug(row[1]).length()));
            out.put(prefix, row);
        }
        return Map.copyOf(out);
    }

    private static String slug(String s) {
        StringBuilder b = new StringBuilder();
        for (char ch : s.toCharArray()) {
            b.append(Character.isLetterOrDigit(ch) ? Character.toUpperCase(ch) : '-');
        }
        String sl = b.toString().replaceAll("-+", "-").replaceAll("^-|-$", "");
        return sl.length() <= 12 ? sl : sl.substring(0, 12);
    }
}
