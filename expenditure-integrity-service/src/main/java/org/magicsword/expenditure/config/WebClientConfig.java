package org.magicsword.expenditure.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class WebClientConfig {

    @Bean
    WebClient schemeEngineWebClient(@Value("${scheme.engine.base-url}") String baseUrl,
                                    @Value("${internal.service-key:}") String internalKey) {
        // the shared key tells scheme-engine this is a backend service, so its per-IP limit on public guest checks
        // (60 a minute) does not cut a detection run short
        WebClient.Builder b = WebClient.builder().baseUrl(baseUrl);
        if (internalKey != null && !internalKey.isBlank()) b.defaultHeader("X-Internal-Key", internalKey.trim());
        return b.build();
    }

    @Bean
    WebClient familyRegistryWebClient(@Value("${family.registry.base-url}") String baseUrl) {
        return WebClient.builder().baseUrl(baseUrl).build();
    }
}
