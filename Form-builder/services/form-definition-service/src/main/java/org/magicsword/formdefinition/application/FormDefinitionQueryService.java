package org.magicsword.formdefinition.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * External read query for an exact {@code (serviceId, version)} (FB-C2 / C3).
 */
@Service
public class FormDefinitionQueryService {

    private final FormDefinitionStore store;

    public FormDefinitionQueryService(FormDefinitionStore store) {
        this.store = store;
    }

    /**
     * @return detached snapshot (definition + revision for ETag)
     * @throws FormDefinitionNotFoundException when missing
     * @throws FormDefinitionAdmissionException when query coordinates are invalid
     * @throws StoredDefinitionCorruptException when persisted JSON fails strict verification
     */
    @Transactional(readOnly = true)
    public FormDefinitionSnapshot getExact(String serviceId, String versionText) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int version = FormDefinitionQueryCoordinateParser.parseVersionQuery(versionText);
        try {
            return store.findSnapshot(admittedServiceId, version)
                    .orElseThrow(() -> new FormDefinitionNotFoundException(admittedServiceId, version));
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }
    }
}
