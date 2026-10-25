package org.citizen.scheme.service;

import org.junit.jupiter.api.Test;
import org.citizen.scheme.model.content.SchemeContentFaqItem;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SchemeContentValidationServiceTest {

    private final SchemeContentValidationService service = new SchemeContentValidationService();

    @Test
    void rejectsHtmlInFaq() {
        Map<String, String> errors = service.validate(
                List.of(), List.of(),
                List.of(new SchemeContentFaqItem("Q?", null, "<b>bad</b>", null)),
                null, null, null);
        assertTrue(errors.containsKey("faqs[0].answer"));
    }

    @Test
    void officialUrlMustBeHttps() {
        Map<String, String> errors = service.validate(
                List.of(), List.of(), List.of(),
                null, null, "http://example.com");
        assertTrue(errors.containsKey("officialUrl"));
    }
}
