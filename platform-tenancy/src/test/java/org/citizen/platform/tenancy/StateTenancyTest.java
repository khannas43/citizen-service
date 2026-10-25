package org.citizen.platform.tenancy;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class StateTenancyTest {

    @AfterEach
    void clear() {
        StateContext.clear();
    }

    private static String token(String payloadJson) {
        Base64.Encoder e = Base64.getUrlEncoder().withoutPadding();
        return "Bearer " + e.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
                + e.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8)) + ".sig";
    }

    @Test
    void readsStateClaim() {
        assertEquals("TG", StateClaimExtractor.fromAuthorization(token("{\"state\":\"TG\",\"sub\":\"x\"}")));
    }

    @Test
    void rejectsMissingBadOrMalformed() {
        assertNull(StateClaimExtractor.fromAuthorization(null));
        assertNull(StateClaimExtractor.fromAuthorization("Basic abc"));
        assertNull(StateClaimExtractor.fromAuthorization("Bearer not-a-jwt"));
        assertNull(StateClaimExtractor.fromAuthorization(token("{\"sub\":\"x\"}")));
        assertNull(StateClaimExtractor.fromAuthorization(token("{\"state\":\"tg\"}")));
        assertNull(StateClaimExtractor.fromAuthorization(token("{\"state\":\"T'; drop table x;--\"}")));
        assertNull(StateClaimExtractor.fromAuthorization(token("{\"state\":5}")));
    }

    @Test
    void filterSetsAndClearsContext() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", token("{\"state\":\"TN\"}"));
        AtomicReference<String> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain() {
            @Override
            public void doFilter(jakarta.servlet.ServletRequest r, jakarta.servlet.ServletResponse s) {
                seen.set(StateContext.get());
            }
        };
        new StateFilter(false).doFilter(req, new MockHttpServletResponse(), chain);
        assertEquals("TN", seen.get());
        assertNull(StateContext.get());
    }

    @Test
    void headerIsIgnoredUnlessTrusted() throws Exception {
        for (boolean trust : new boolean[] {false, true}) {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.addHeader(StateFilter.STATE_HEADER, "TG");
            AtomicReference<String> seen = new AtomicReference<>();
            MockFilterChain chain = new MockFilterChain() {
                @Override
                public void doFilter(jakarta.servlet.ServletRequest r, jakarta.servlet.ServletResponse s) {
                    seen.set(StateContext.get());
                }
            };
            new StateFilter(trust).doFilter(req, new MockHttpServletResponse(), chain);
            assertEquals(trust ? "TG" : null, seen.get());
        }
    }

    @Test
    void dataSourceSetsStateOnEveryConnection() throws Exception {
        DataSource target = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(target.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(anyString())).thenReturn(ps);
        StateAwareDataSource ds = new StateAwareDataSource(target);

        StateContext.set("TG");
        assertSame(conn, ds.getConnection());
        verify(ps).setString(1, "TG");

        StateContext.clear();
        ds.getConnection();
        verify(ps).setString(1, "");   // no state -> database default
        verify(ps, times(2)).execute();
    }
}
