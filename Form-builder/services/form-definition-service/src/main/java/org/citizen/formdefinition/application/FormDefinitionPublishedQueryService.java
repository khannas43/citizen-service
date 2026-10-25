package org.citizen.formdefinition.application;

import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Safe latest-published lookup (FB-C5).
 *
 * <p>Release-head policy (technical; requires final governance confirmation):
 *
 * <ol>
 *   <li>Find the highest-version definition whose status is {@code published} or {@code retired}
 *   <li>Ignore higher draft/submitted/approved versions
 *   <li>If no published/retired release exists → not found
 *   <li>If the release head is {@code retired} → not found (no fallback to older published)
 *   <li>If the release head is {@code published} → return it after coordinate + C1 checks
 * </ol>
 */
@Service
public class FormDefinitionPublishedQueryService {

    private final FormDefinitionStore store;
    private final FormDefinitionValidationService validationService;

    public FormDefinitionPublishedQueryService(
            FormDefinitionStore store, FormDefinitionValidationService validationService) {
        this.store = store;
        this.validationService = validationService;
    }

    @Transactional(readOnly = true)
    public FormDefinitionSnapshot getLatestPublished(String serviceId) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);

        FormDefinitionSnapshot head;
        try {
            head =
                    store.findReleaseHead(admittedServiceId)
                            .orElseThrow(PublishedFormDefinitionNotFoundException::new);
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        if (head.status() == FormDefinitionStatus.retired) {
            throw new PublishedFormDefinitionNotFoundException();
        }
        if (head.status() != FormDefinitionStatus.published) {
            // Defence: release-head query must only return published|retired.
            throw new StoredDefinitionCorruptException(
                    new IllegalStateException("release head status is not published or retired"));
        }

        try {
            // Re-verify document status matches published (column already checked in store).
            if (head.definition().path("status").asText(null) == null
                    || !FormDefinitionStatus.published
                            .name()
                            .equals(head.definition().get("status").asText())) {
                throw new StoredDefinitionCorruptException(
                        new IllegalStateException("published document status mismatch"));
            }
        } catch (StoredDefinitionCorruptException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        ValidationResult validation = validationService.validate(head.definition());
        if (!validation.valid()) {
            throw new StoredDefinitionCorruptException(
                    new IllegalStateException("stored published definition failed C1 validation"));
        }

        return head;
    }
}
