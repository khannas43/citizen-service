package org.magicsword.formdefinition.application;

import java.util.List;
import java.util.Objects;
import java.util.OptionalInt;

/**
 * Bounded version metadata page (FB-C5).
 *
 * <p>{@code nextAfterVersion} is absent when this page is the last.
 */
public final class FormDefinitionVersionListPage {

    private final String serviceId;
    private final List<FormDefinitionVersionItem> items;
    private final OptionalInt nextAfterVersion;

    public FormDefinitionVersionListPage(
            String serviceId, List<FormDefinitionVersionItem> items, OptionalInt nextAfterVersion) {
        this.serviceId = Objects.requireNonNull(serviceId, "serviceId");
        this.items = List.copyOf(Objects.requireNonNull(items, "items"));
        this.nextAfterVersion = Objects.requireNonNull(nextAfterVersion, "nextAfterVersion");
    }

    public String serviceId() {
        return serviceId;
    }

    public List<FormDefinitionVersionItem> items() {
        return items;
    }

    public OptionalInt nextAfterVersion() {
        return nextAfterVersion;
    }
}
