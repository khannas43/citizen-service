package org.magicsword.scheme.service;

import org.magicsword.scheme.model.content.SchemeContentDocumentItem;
import org.magicsword.scheme.model.content.SchemeContentFaqItem;
import org.magicsword.scheme.model.content.SchemeContentStepItem;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class SchemeContentValidationService {

    private static final Pattern HTML = Pattern.compile("<[^>]+>");
    private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");
    private static final Pattern HELPLINE = Pattern.compile("^[0-9+\\s\\-]{3,24}$");

    public Map<String, String> validate(
            List<SchemeContentDocumentItem> documents,
            List<SchemeContentStepItem> steps,
            List<SchemeContentFaqItem> faqs,
            String helplineLabel,
            String helplineNumber,
            String officialUrl) {
        return validate(documents, steps, faqs, helplineLabel, helplineNumber, officialUrl,
                null, null, null, null, null, null);
    }

    public Map<String, String> validate(
            List<SchemeContentDocumentItem> documents,
            List<SchemeContentStepItem> steps,
            List<SchemeContentFaqItem> faqs,
            String helplineLabel,
            String helplineNumber,
            String officialUrl,
            String overview,
            String overviewGu,
            String benefitsNote,
            String benefitsNoteGu,
            String eligibilityNote,
            String eligibilityNoteGu) {

        Map<String, String> errors = new LinkedHashMap<>();
        checkText(errors, "overview", overview, 2000, false);
        checkText(errors, "overviewGu", overviewGu, 2000, false);
        checkText(errors, "benefitsNote", benefitsNote, 1000, false);
        checkText(errors, "benefitsNoteGu", benefitsNoteGu, 1000, false);
        checkText(errors, "eligibilityNote", eligibilityNote, 1000, false);
        checkText(errors, "eligibilityNoteGu", eligibilityNoteGu, 1000, false);
        if (documents != null) {
            if (documents.size() > 20) errors.put("documentsRequired", "At most 20 documents");
            for (int i = 0; i < (documents == null ? 0 : documents.size()); i++) {
                SchemeContentDocumentItem d = documents.get(i);
                checkText(errors, "documentsRequired[" + i + "].title", d.title(), 160, true);
                checkText(errors, "documentsRequired[" + i + "].titleGu", d.titleGu(), 160, false);
                checkText(errors, "documentsRequired[" + i + "].note", d.note(), 2000, false);
                checkText(errors, "documentsRequired[" + i + "].noteGu", d.noteGu(), 2000, false);
            }
        }
        if (steps != null) {
            if (steps.size() > 15) errors.put("applicationSteps", "At most 15 steps");
            for (int i = 0; i < steps.size(); i++) {
                SchemeContentStepItem s = steps.get(i);
                checkText(errors, "applicationSteps[" + i + "].title", s.title(), 160, true);
                checkText(errors, "applicationSteps[" + i + "].titleGu", s.titleGu(), 160, false);
                checkText(errors, "applicationSteps[" + i + "].detail", s.detail(), 2000, false);
                checkText(errors, "applicationSteps[" + i + "].detailGu", s.detailGu(), 2000, false);
            }
        }
        if (faqs != null) {
            if (faqs.size() > 20) errors.put("faqs", "At most 20 FAQs");
            for (int i = 0; i < faqs.size(); i++) {
                SchemeContentFaqItem f = faqs.get(i);
                checkText(errors, "faqs[" + i + "].question", f.question(), 160, true);
                checkText(errors, "faqs[" + i + "].questionGu", f.questionGu(), 160, false);
                checkText(errors, "faqs[" + i + "].answer", f.answer(), 2000, true);
                checkText(errors, "faqs[" + i + "].answerGu", f.answerGu(), 2000, false);
            }
        }
        checkText(errors, "helplineLabel", helplineLabel, 160, false);
        if (helplineNumber != null && !helplineNumber.isBlank()) {
            if (!HELPLINE.matcher(helplineNumber.trim()).matches()) {
                errors.put("helplineNumber", "Invalid helpline format");
            }
        }
        if (officialUrl != null && !officialUrl.isBlank()) {
            String u = officialUrl.trim();
            if (!u.startsWith("https://")) {
                errors.put("officialUrl", "URL must start with https://");
            } else {
                try {
                    URI.create(u);
                } catch (Exception e) {
                    errors.put("officialUrl", "Invalid URL");
                }
            }
        }
        return errors;
    }

    private static void checkText(Map<String, String> errors, String field, String value, int max, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) errors.put(field, "Required");
            return;
        }
        if (value.length() > max) errors.put(field, "Max length " + max);
        if (HTML.matcher(value).find()) errors.put(field, "HTML not allowed");
        if (CONTROL.matcher(value).find()) errors.put(field, "Invalid control characters");
    }
}
