package org.citizen.formdefinition.governance;

import java.util.List;
import java.util.Optional;

import org.citizen.formdefinition.application.FormDefinitionStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Governance queue listing (FB-E1). Authorization runs before any store query. Metadata only —
 * not a DST inbox.
 */
@Service
public class FormDefinitionGovernanceQueueService {

    private final GovernanceAuthorizationService authorizationService;
    private final FormDefinitionStore store;

    public FormDefinitionGovernanceQueueService(
            GovernanceAuthorizationService authorizationService, FormDefinitionStore store) {
        this.authorizationService = authorizationService;
        this.store = store;
    }

    @Transactional(readOnly = true)
    public FormDefinitionGovernanceQueuePage listQueue(
            String afterServiceId, String afterVersionText, String limitText) {
        authorizationService.require(GovernanceCapability.READ_FORM_DEFINITION_GOVERNANCE);

        GovernanceQueueCursorParser.AdmittedPageRequest pageRequest =
                GovernanceQueueCursorParser.admit(afterServiceId, afterVersionText, limitText);
        int fetchLimit = pageRequest.limit() + 1;

        List<FormDefinitionGovernanceQueueItem> fetched =
                store.listGovernanceQueueItems(pageRequest.cursorOrNull(), fetchLimit);

        if (fetched.size() > pageRequest.limit()) {
            List<FormDefinitionGovernanceQueueItem> items =
                    fetched.subList(0, pageRequest.limit());
            FormDefinitionGovernanceQueueItem last = items.get(items.size() - 1);
            return new FormDefinitionGovernanceQueuePage(
                    items, Optional.of(new FormDefinitionGovernanceQueueItem(
                            last.serviceId(), last.version(), last.status())));
        }
        return new FormDefinitionGovernanceQueuePage(fetched, Optional.empty());
    }
}
