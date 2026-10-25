package org.citizen.formdefinition.governance;

import org.citizen.formdefinition.application.FormDefinitionAdmissionException;
import org.citizen.formdefinition.application.FormDefinitionQueryCoordinateParser;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.application.FormDefinitionStore;
import org.citizen.formdefinition.application.FormDefinitionValidationService;
import org.citizen.formdefinition.application.StoredDefinitionCorruptException;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Governed detail read for submitted|approved definitions (FB-E1). Runs C1 before return; generic
 * not-found for missing or ineligible statuses.
 */
@Service
public class FormDefinitionGovernanceDetailService {

    private final GovernanceAuthorizationService authorizationService;
    private final FormDefinitionStore store;
    private final FormDefinitionValidationService validationService;

    public FormDefinitionGovernanceDetailService(
            GovernanceAuthorizationService authorizationService,
            FormDefinitionStore store,
            FormDefinitionValidationService validationService) {
        this.authorizationService = authorizationService;
        this.store = store;
        this.validationService = validationService;
    }

    @Transactional(readOnly = true)
    public FormDefinitionSnapshot getDetail(String serviceId, String versionText) {
        authorizationService.require(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);

        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int version = FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText);

        FormDefinitionSnapshot snapshot;
        try {
            snapshot =
                    store.findSnapshot(admittedServiceId, version)
                            .orElseThrow(GovernanceDefinitionNotFoundException::new);
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        FormDefinitionStatus status = snapshot.status();
        if (status != FormDefinitionStatus.submitted && status != FormDefinitionStatus.approved) {
            throw new GovernanceDefinitionNotFoundException();
        }

        try {
            String documentStatus = snapshot.definition().path("status").asText(null);
            if (documentStatus == null || !status.name().equals(documentStatus)) {
                throw new StoredDefinitionCorruptException(
                        new IllegalStateException("governance document status mismatch"));
            }
        } catch (StoredDefinitionCorruptException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        ValidationResult validation = validationService.validate(snapshot.definition());
        if (!validation.valid()) {
            throw new StoredDefinitionCorruptException(
                    new IllegalStateException("stored governance definition failed C1 validation"));
        }

        return snapshot;
    }
}
