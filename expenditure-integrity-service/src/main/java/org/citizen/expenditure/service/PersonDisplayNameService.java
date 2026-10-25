package org.citizen.expenditure.service;

import org.citizen.expenditure.client.FamilyRegistryClient;
import org.citizen.expenditure.entity.EntitlementUnit;
import org.citizen.expenditure.entity.IntegrityAlert;
import org.citizen.expenditure.repository.EntitlementUnitRepository;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class PersonDisplayNameService {

    private final FamilyRegistryClient familyRegistry;
    private final EntitlementUnitRepository unitRepo;

    public PersonDisplayNameService(FamilyRegistryClient familyRegistry, EntitlementUnitRepository unitRepo) {
        this.familyRegistry = familyRegistry;
        this.unitRepo = unitRepo;
    }

    /** Prefer family registry name; fall back to entitlement master when it is not a demo placeholder. */
    public void applyBeneficiaryDisplayName(IntegrityAlert alert, EntitlementUnit unit) {
        if (alert == null || alert.getPersonId() == null || alert.getPersonId().isBlank()) {
            return;
        }
        String familyId = resolveFamilyId(alert.getPersonId(), unit);
        familyRegistry.findPersonName(alert.getPersonId(), familyId).ifPresent(alert::setPersonName);
        if (!isPlaceholderName(alert.getPersonName())) {
            return;
        }
        if (unit != null && unit.getPersonName() != null && !isPlaceholderName(unit.getPersonName())) {
            alert.setPersonName(unit.getPersonName());
        }
    }

    public String nameForNewAlert(String personId, String familyId, String entitlementName) {
        String resolved = familyRegistry.findPersonName(personId, familyId).orElse(null);
        if (resolved != null && !resolved.isBlank()) {
            return resolved;
        }
        if (entitlementName != null && !isPlaceholderName(entitlementName)) {
            return entitlementName;
        }
        return entitlementName != null && !entitlementName.isBlank() ? entitlementName : personId;
    }

    private String resolveFamilyId(String personId, EntitlementUnit unit) {
        if (unit != null && unit.getFamilyId() != null && !unit.getFamilyId().isBlank()) {
            return unit.getFamilyId();
        }
        return unitRepo.findByPersonId(personId).stream()
                .map(EntitlementUnit::getFamilyId)
                .filter(Objects::nonNull)
                .filter(f -> !f.isBlank())
                .findFirst()
                .orElse(null);
    }

    static boolean isPlaceholderName(String name) {
        if (name == null || name.isBlank()) {
            return true;
        }
        String n = name.trim();
        return n.startsWith("Pilot ") || n.startsWith("Resolved Demo ");
    }
}
