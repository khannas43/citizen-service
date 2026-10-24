package org.magicsword.formdefinition.validation.palette;

import java.util.Objects;

/** One controlled palette entry from the server manifest (FB-C1). */
public final class ControlledPaletteEntry {

    public enum Category {
        data,
        display,
        layout
    }

    public enum RjsfKind {
        widget,
        field
    }

    private final String widgetType;
    private final Category category;
    private final boolean producesData;
    private final boolean supportsRequired;
    private final RjsfKind rjsfKind;

    public ControlledPaletteEntry(
            String widgetType,
            Category category,
            boolean producesData,
            boolean supportsRequired,
            RjsfKind rjsfKind) {
        this.widgetType = Objects.requireNonNull(widgetType, "widgetType");
        this.category = Objects.requireNonNull(category, "category");
        this.producesData = producesData;
        this.supportsRequired = supportsRequired;
        this.rjsfKind = Objects.requireNonNull(rjsfKind, "rjsfKind");
    }

    public String widgetType() {
        return widgetType;
    }

    public Category category() {
        return category;
    }

    public boolean producesData() {
        return producesData;
    }

    public boolean supportsRequired() {
        return supportsRequired;
    }

    public RjsfKind rjsfKind() {
        return rjsfKind;
    }

    public boolean isDisplayOrLayout() {
        return category == Category.display || category == Category.layout;
    }
}
