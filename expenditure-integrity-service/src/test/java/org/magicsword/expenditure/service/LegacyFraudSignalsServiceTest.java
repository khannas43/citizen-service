package org.magicsword.expenditure.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LegacyFraudSignalsServiceTest {

    private static LegacyFraudSignalsService answering(ClientResponse response) {
        ExchangeFunction exchange = request -> Mono.just(response);
        return new LegacyFraudSignalsService(WebClient.builder().baseUrl("http://engine.test").exchangeFunction(exchange).build());
    }

    private static ClientResponse status(HttpStatus status) {
        return ClientResponse.create(status).header("Content-Type", MediaType.APPLICATION_JSON_VALUE).body("{}").build();
    }

    @Test
    void returnsTheSignalsTheEngineSent() {
        ClientResponse ok = ClientResponse.create(HttpStatus.OK)
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .body("[{\"signalType\":\"MULTI_SCHEME_OVERLAP\",\"severity\":\"HIGH\"}]").build();
        List<Map<String, Object>> signals = answering(ok).fetchLegacySignals("Bearer abc");
        assertEquals(1, signals.size());
        assertEquals("MULTI_SCHEME_OVERLAP", signals.get(0).get("signalType"));
    }

    @Test
    void anEmptyAnswerIsAnEmptyList() {
        ClientResponse empty = ClientResponse.create(HttpStatus.OK)
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE).body("[]").build();
        assertTrue(answering(empty).fetchLegacySignals("Bearer abc").isEmpty());
    }

    @Test
    void aRefusalFromTheEngineIsReportedAsForbidden_notAsNoSignals() {
        for (HttpStatus s : List.of(HttpStatus.FORBIDDEN, HttpStatus.UNAUTHORIZED)) {
            ResponseStatusException e = assertThrows(ResponseStatusException.class,
                    () -> answering(status(s)).fetchLegacySignals("Bearer abc"));
            assertEquals(HttpStatus.FORBIDDEN, e.getStatusCode());
        }
    }

    @Test
    void anEngineErrorOrOutageIsReportedAsBadGateway() {
        ResponseStatusException serverError = assertThrows(ResponseStatusException.class,
                () -> answering(status(HttpStatus.INTERNAL_SERVER_ERROR)).fetchLegacySignals("Bearer abc"));
        assertEquals(HttpStatus.BAD_GATEWAY, serverError.getStatusCode());

        LegacyFraudSignalsService down = new LegacyFraudSignalsService(WebClient.builder().baseUrl("http://engine.test")
                .exchangeFunction(request -> Mono.error(new java.net.ConnectException("refused"))).build());
        ResponseStatusException unreachable = assertThrows(ResponseStatusException.class, () -> down.fetchLegacySignals("Bearer abc"));
        assertEquals(HttpStatus.BAD_GATEWAY, unreachable.getStatusCode());
    }
}
