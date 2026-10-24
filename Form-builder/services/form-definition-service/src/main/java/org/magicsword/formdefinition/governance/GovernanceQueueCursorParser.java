package org.magicsword.formdefinition.governance;

import org.magicsword.formdefinition.application.FormDefinitionPaginationParser;
import org.magicsword.formdefinition.application.FormDefinitionQueryCoordinateParser;
import org.magicsword.formdefinition.application.InvalidPaginationException;

/**
 * Governance queue keyset cursor + limit admission (FB-E1).
 *
 * <p>{@code afterServiceId} and {@code afterVersion} must both be present or both absent.
 */
public final class GovernanceQueueCursorParser {

    private GovernanceQueueCursorParser() {}

    public record Cursor(String afterServiceId, int afterVersion) {}

    public record AdmittedPageRequest(Cursor cursorOrNull, int limit) {}

    public static AdmittedPageRequest admit(
            String afterServiceId, String afterVersionText, String limitText) {
        boolean hasService = afterServiceId != null;
        boolean hasVersion = afterVersionText != null;
        if (hasService != hasVersion) {
            throw new InvalidPaginationException(
                    "afterServiceId and afterVersion must both be supplied or both omitted");
        }
        int limit = FormDefinitionPaginationParser.parseLimit(limitText);
        if (!hasService) {
            return new AdmittedPageRequest(null, limit);
        }
        // Empty string is not "absent" — reject paired blanks via coordinate/version admission.
        String admittedServiceId = FormDefinitionQueryCoordinateParser.admitServiceId(afterServiceId);
        int afterVersion = FormDefinitionPaginationParser.parseAfterVersion(afterVersionText);
        if (afterVersion < 1) {
            // parseAfterVersion returns 0 only for null; when present it is [1-9]...
            throw new InvalidPaginationException("afterVersion must be a canonical positive decimal integer");
        }
        return new AdmittedPageRequest(new Cursor(admittedServiceId, afterVersion), limit);
    }
}
