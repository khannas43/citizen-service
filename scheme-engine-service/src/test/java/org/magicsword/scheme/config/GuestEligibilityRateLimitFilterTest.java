package org.magicsword.scheme.config;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GuestEligibilityRateLimitFilterTest {

    private int callMany(GuestEligibilityRateLimitFilter f, String key, int times) throws Exception {
        int last = 0;
        FilterChain chain = (req, res) -> {};
        for (int i = 0; i < times; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/scheme-engine-service/v1/eligibility/guest");
            req.setRemoteAddr("10.0.0.7");
            if (key != null) req.addHeader("X-Internal-Key", key);
            MockHttpServletResponse res = new MockHttpServletResponse();
            f.doFilter(req, res, chain);
            last = res.getStatus();
        }
        return last;
    }

    @Test
    void thePublicIsStoppedAfterSixtyChecksAMinute() throws Exception {
        assertEquals(429, callMany(new GuestEligibilityRateLimitFilter("secret"), null, 61));
    }

    @Test
    void aWrongKeyGetsNoExemption() throws Exception {
        assertEquals(429, callMany(new GuestEligibilityRateLimitFilter("secret"), "guess", 61));
    }

    @Test
    void aBackendServiceWithTheSharedKeyIsNotLimited() throws Exception {
        assertEquals(200, callMany(new GuestEligibilityRateLimitFilter("secret"), "secret", 300));
    }

    @Test
    void withNoKeyConfiguredNoHeaderIsTrusted() throws Exception {
        assertEquals(429, callMany(new GuestEligibilityRateLimitFilter(""), "", 61));
    }
}
