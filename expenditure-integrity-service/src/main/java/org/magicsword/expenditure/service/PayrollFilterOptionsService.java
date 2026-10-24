package org.magicsword.expenditure.service;

import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class PayrollFilterOptionsService {

    private final EmployeeIdentityRepository employeeRepo;

    public PayrollFilterOptionsService(EmployeeIdentityRepository employeeRepo) {
        this.employeeRepo = employeeRepo;
    }

    public Map<String, List<String>> options(String district, String taluka) {
        List<EmployeeIdentity> all = employeeRepo.findAll();
        List<String> districts = distinct(all.stream().map(EmployeeIdentity::getDistrict));
        List<EmployeeIdentity> scoped = all.stream()
                .filter(e -> matchesDistrict(e, district))
                .filter(e -> matchesTaluka(e, taluka))
                .toList();
        List<String> talukas = district == null || district.isBlank()
                ? List.of()
                : distinct(scoped.stream().map(EmployeeIdentity::getTaluka));
        List<String> ddoCodes = distinct(scoped.stream().map(EmployeeIdentity::getDdoCode));
        return Map.of("districts", districts, "talukas", talukas, "ddoCodes", ddoCodes);
    }

    private static List<String> distinct(java.util.stream.Stream<String> values) {
        return values.filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();
    }

    private static boolean matchesDistrict(EmployeeIdentity e, String district) {
        if (district == null || district.isBlank()) return true;
        return e.getDistrict() != null && e.getDistrict().equalsIgnoreCase(district.trim());
    }

    private static boolean matchesTaluka(EmployeeIdentity e, String taluka) {
        if (taluka == null || taluka.isBlank()) return true;
        return e.getTaluka() != null && e.getTaluka().equalsIgnoreCase(taluka.trim());
    }
}
