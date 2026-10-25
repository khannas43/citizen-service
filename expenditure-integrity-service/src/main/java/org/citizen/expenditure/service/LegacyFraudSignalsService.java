package org.citizen.expenditure.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Proxies legacy scheme-engine fraud signals for officers who still use the old screen.
 * A refusal or an outage is reported as such: an empty list must only ever mean "nothing was found".
 */
@Service
public class LegacyFraudSignalsService {

    private final WebClient webClient;

    @org.springframework.beans.factory.annotation.Autowired
    public LegacyFraudSignalsService(@Value("${scheme.engine.base-url}") String baseUrl) {
        this(WebClient.builder().baseUrl(baseUrl).build());
    }

    LegacyFraudSignalsService(WebClient webClient) {
        this.webClient = webClient;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchLegacySignals(String bearerToken) {
        try {
            List<?> body = webClient.get()
                    .uri("/v1/admin/fraud-signals")
                    .headers(h -> {
                        if (bearerToken != null && !bearerToken.isBlank()) {
                            h.setBearerAuth(bearerToken.replace("Bearer ", "").trim());
                        }
                    })
                    .retrieve()
                    .bodyToFlux(Map.class)
                    .collectList()
                    .block();
            if (body == null) return Collections.emptyList();
            return body.stream().map(row -> (Map<String, Object>) row).toList();
        } catch (WebClientResponseException e) {
            if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "The scheme engine does not allow your role to see scheme-overlap signals.", e);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "The scheme engine answered with an error (HTTP " + e.getStatusCode().value() + ").", e);
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The scheme engine could not be reached.", e);
        }
    }
}
