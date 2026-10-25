package org.citizen.formdefinition.application;

import java.util.List;
import java.util.OptionalInt;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bounded Form Definition version metadata listing (FB-C5).
 *
 * <p>Ascending, exclusive {@code afterVersion} cursor, fetch at most {@code limit+1} to compute
 * {@code nextAfterVersion}. No count query. Corrupt rows fail the entire response.
 */
@Service
public class FormDefinitionVersionQueryService {

    private final FormDefinitionStore store;

    public FormDefinitionVersionQueryService(FormDefinitionStore store) {
        this.store = store;
    }

    @Transactional(readOnly = true)
    public FormDefinitionVersionListPage listVersions(
            String serviceId, String afterVersionText, String limitText) {
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(serviceId);
        int afterVersion = FormDefinitionPaginationParser.parseAfterVersion(afterVersionText);
        int limit = FormDefinitionPaginationParser.parseLimit(limitText);
        int fetchLimit = limit + 1;

        List<FormDefinitionVersionItem> fetched;
        try {
            fetched = store.listVersionItems(admittedServiceId, afterVersion, fetchLimit);
        } catch (FormDefinitionAdmissionException ex) {
            throw new StoredDefinitionCorruptException(ex);
        }

        OptionalInt nextAfterVersion = OptionalInt.empty();
        List<FormDefinitionVersionItem> items = fetched;
        if (fetched.size() > limit) {
            items = fetched.subList(0, limit);
            nextAfterVersion = OptionalInt.of(items.get(items.size() - 1).version());
        }

        return new FormDefinitionVersionListPage(admittedServiceId, items, nextAfterVersion);
    }
}
