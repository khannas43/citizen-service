package org.citizen.formdefinition.governance;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.citizen.formdefinition.domain.FormDefinitionStatus;

/** Immutable governance queue page (FB-E1). Metadata only. */
public final class FormDefinitionGovernanceQueuePage {

    private final List<FormDefinitionGovernanceQueueItem> items;
    private final Optional<FormDefinitionGovernanceQueueItem> nextCursor;

    public FormDefinitionGovernanceQueuePage(
            List<FormDefinitionGovernanceQueueItem> items,
            Optional<FormDefinitionGovernanceQueueItem> nextCursor) {
        this.items = List.copyOf(Objects.requireNonNull(items, "items"));
        this.nextCursor = Objects.requireNonNull(nextCursor, "nextCursor");
    }

    public List<FormDefinitionGovernanceQueueItem> items() {
        return items;
    }

    public Optional<FormDefinitionGovernanceQueueItem> nextCursor() {
        return nextCursor;
    }
}
