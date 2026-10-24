package org.magicsword.expenditure.service;

import org.magicsword.expenditure.domain.IntegrityDomain;
import org.magicsword.expenditure.entity.EmployeeIdentity;
import org.magicsword.expenditure.entity.EntitlementUnit;
import org.magicsword.expenditure.entity.IntegrityAlert;
import org.magicsword.expenditure.repository.EmployeeIdentityRepository;
import org.magicsword.expenditure.repository.EntitlementUnitRepository;
import org.magicsword.expenditure.repository.IntegrityAlertRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.magicsword.expenditure.security.DomainAccess;

import java.math.BigDecimal;
import java.util.*;

@Service
public class PersonViewService {

    private final EmployeeIdentityRepository employeeRepo;
    private final IntegrityAlertRepository alertRepo;
    private final EntitlementUnitRepository unitRepo;
    private final DomainAccess access;

    public PersonViewService(EmployeeIdentityRepository employeeRepo, IntegrityAlertRepository alertRepo,
                             EntitlementUnitRepository unitRepo, DomainAccess access) {
        this.employeeRepo = employeeRepo;
        this.alertRepo = alertRepo;
        this.unitRepo = unitRepo;
        this.access = access;
    }

    public Set<String> linkedRegistryIds(Collection<String> registryPersonIds) {
        if (registryPersonIds == null || registryPersonIds.isEmpty()) {
            return Set.of();
        }
        List<String> ids = registryPersonIds.stream().filter(Objects::nonNull).filter(s -> !s.isBlank()).distinct().toList();
        if (ids.isEmpty()) {
            return Set.of();
        }
        return employeeRepo.findByPersonIdIn(ids).stream()
                .map(EmployeeIdentity::getPersonId)
                .filter(Objects::nonNull)
                .filter(s -> !s.isBlank())
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    public Map<String, Object> overview(String personKey, Authentication auth) {
        if (personKey == null || personKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A person id or employee code is required.");
        }
        String key = personKey.trim();
        Resolved resolved = resolve(key);
        if (!resolved.known()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No person or employee record matches that id.");
        }

        boolean linked = resolved.employee() != null
                && resolved.registryId() != null
                && !resolved.registryId().isBlank();
        boolean canBen = access.canRead(auth, IntegrityDomain.BENEFICIARY);
        boolean canPay = access.canRead(auth, IntegrityDomain.PAYROLL);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("personId", resolved.registryId());
        out.put("personName", resolved.displayName());
        out.put("linked", linked);

        if (canBen && resolved.registryId() != null) {
            out.put("beneficiary", beneficiarySide(resolved.registryId()));
        }
        if (canPay && resolved.employee() != null) {
            out.put("payroll", payrollSide(resolved.employee()));
        }
        return out;
    }

    private Map<String, Object> beneficiarySide(String registryId) {
        List<IntegrityAlert> alerts = alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, registryId);
        List<Map<String, Object>> entitlementRows = unitRepo.findByPersonId(registryId).stream()
                .map(this::toEntitlement)
                .toList();
        Map<String, Object> side = new LinkedHashMap<>();
        side.put("alerts", alerts.stream().map(this::toAlert).toList());
        side.put("entitlements", entitlementRows);
        side.put("totalAtStake", stake(alerts));
        return side;
    }

    private Map<String, Object> payrollSide(EmployeeIdentity employee) {
        List<IntegrityAlert> alerts = alertRepo.findByDomainAndPersonId(IntegrityDomain.PAYROLL, employee.getEmployeeCode());
        Map<String, Object> side = new LinkedHashMap<>();
        side.put("employeeCode", employee.getEmployeeCode());
        side.put("post", employee.getPostTitle());
        side.put("ddoCode", employee.getDdoCode());
        side.put("alerts", alerts.stream().map(this::toAlert).toList());
        side.put("totalAtStake", stake(alerts));
        return side;
    }

    private Map<String, Object> toAlert(IntegrityAlert a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("ruleCode", a.getRuleCode());
        m.put("status", a.getStatus());
        m.put("severity", a.getSeverity());
        m.put("amount", a.getAmountDelta());
        m.put("caseId", a.getCaseId());
        m.put("summary", summary(a));
        return m;
    }

    private Map<String, Object> toEntitlement(EntitlementUnit u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("schemeName", u.getSchemeName());
        m.put("authorizedAmount", u.getAuthorizedAmount());
        m.put("status", u.getStatus());
        m.put("periodStart", u.getPeriodStart());
        m.put("periodEnd", u.getPeriodEnd());
        m.put("district", u.getDistrict());
        return m;
    }

    private static BigDecimal stake(List<IntegrityAlert> alerts) {
        return alerts.stream()
                .filter(a -> "OPEN".equals(a.getStatus()))
                .map(a -> a.getAmountDelta() != null ? a.getAmountDelta() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static String summary(IntegrityAlert a) {
        String who = a.getPersonName() != null ? a.getPersonName() : "This person";
        String subject = a.getSchemeName() != null && !a.getSchemeName().isBlank()
                ? a.getSchemeName()
                : (a.getRuleCode() != null ? "rule " + a.getRuleCode() : "integrity check");
        return who + " — " + subject + " (" + a.getStatus() + ")";
    }

    private Resolved resolve(String key) {
        Optional<EmployeeIdentity> byCode = employeeRepo.findByEmployeeCode(key);
        if (byCode.isPresent()) {
            EmployeeIdentity e = byCode.get();
            return new Resolved(e.getPersonId(), e, e.getPersonName());
        }
        Optional<EmployeeIdentity> byPerson = employeeRepo.findFirstByPersonId(key);
        if (byPerson.isPresent()) {
            EmployeeIdentity e = byPerson.get();
            String name = nameFromAlerts(key);
            if (name == null) {
                name = nameFrom(key, e);
            }
            return new Resolved(key, e, name);
        }
        if (!unitRepo.findByPersonId(key).isEmpty()
                || !alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, key).isEmpty()) {
            return new Resolved(key, null, nameFromAlerts(key));
        }
        return Resolved.unknown();
    }

    private String nameFrom(String registryId, EmployeeIdentity e) {
        if (e.getPersonName() != null && !e.getPersonName().isBlank()) {
            return e.getPersonName();
        }
        return nameFromAlerts(registryId);
    }

    private String nameFromAlerts(String registryId) {
        return alertRepo.findByDomainAndPersonId(IntegrityDomain.BENEFICIARY, registryId).stream()
                .map(IntegrityAlert::getPersonName)
                .filter(Objects::nonNull)
                .filter(s -> !s.isBlank())
                .findFirst()
                .orElse(unitRepo.findByPersonId(registryId).stream()
                        .map(EntitlementUnit::getPersonName)
                        .filter(Objects::nonNull)
                        .findFirst()
                        .orElse(null));
    }

    private record Resolved(String registryId, EmployeeIdentity employee, String displayName) {
        static Resolved unknown() {
            return new Resolved(null, null, null);
        }

        boolean known() {
            return registryId != null || employee != null;
        }
    }
}
