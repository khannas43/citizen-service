package org.magicsword.scheme.model;

import org.magicsword.scheme.model.content.SchemeContentDocumentItem;
import org.magicsword.scheme.model.content.SchemeContentFaqItem;
import org.magicsword.scheme.model.content.SchemeContentStepItem;

import java.util.List;

public record SchemeContentSaveRequest(
        Long version,
        List<SchemeContentDocumentItem> documentsRequired,
        List<SchemeContentStepItem> applicationSteps,
        List<SchemeContentFaqItem> faqs,
        String helplineLabel,
        String helplineNumber,
        String officialUrl,
        String overview,
        String overviewGu,
        String benefitsNote,
        String benefitsNoteGu,
        String eligibilityNote,
        String eligibilityNoteGu
) {
    /** Convenience for callers (and tests) that only deal with the original sections. */
    public SchemeContentSaveRequest(Long version, List<SchemeContentDocumentItem> documentsRequired,
            List<SchemeContentStepItem> applicationSteps, List<SchemeContentFaqItem> faqs,
            String helplineLabel, String helplineNumber, String officialUrl) {
        this(version, documentsRequired, applicationSteps, faqs, helplineLabel, helplineNumber, officialUrl,
                null, null, null, null, null, null);
    }
}
