package org.citizen.expenditure.service;

import org.citizen.expenditure.entity.EmployeeIdentity;
import org.citizen.expenditure.entity.EntitlementUnit;
import org.citizen.expenditure.repository.EmployeeIdentityRepository;
import org.citizen.expenditure.repository.EntitlementUnitRepository;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class TalukaCoverageService {

    private final EntitlementUnitRepository unitRepo;
    private final EmployeeIdentityRepository employeeRepo;

    public TalukaCoverageService(EntitlementUnitRepository unitRepo, EmployeeIdentityRepository employeeRepo) {
        this.unitRepo = unitRepo;
        this.employeeRepo = employeeRepo;
    }

    public List<Map<String, Object>> talukaCoverage() {
        Map<String, Map<String, Object>> rows = new TreeMap<>();
        for (EntitlementUnit u : unitRepo.findAll()) {
            if (u.getDistrict() == null || u.getTaluka() == null) continue;
            Map<String, Object> row = rows.computeIfAbsent(key(u.getDistrict(), u.getTaluka()), k -> baseRow(u.getDistrict(), u.getTaluka()));
            row.put("entitlementUnits", ((Number) row.get("entitlementUnits")).intValue() + 1);
        }
        for (EmployeeIdentity e : employeeRepo.findAll()) {
            if (e.getDistrict() == null || e.getTaluka() == null) continue;
            Map<String, Object> row = rows.computeIfAbsent(key(e.getDistrict(), e.getTaluka()), k -> baseRow(e.getDistrict(), e.getTaluka()));
            row.put("employees", ((Number) row.get("employees")).intValue() + 1);
        }
        return rows.values().stream()
                .peek(r -> r.put("meetsMinimum20", ((Number) r.get("entitlementUnits")).intValue() >= 20
                        && ((Number) r.get("employees")).intValue() >= 20))
                .toList();
    }

    private static String key(String district, String taluka) {
        return district.toLowerCase() + "|" + taluka.toLowerCase();
    }

    private static Map<String, Object> baseRow(String district, String taluka) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("district", district);
        m.put("taluka", taluka);
        m.put("entitlementUnits", 0);
        m.put("employees", 0);
        return m;
    }
}
