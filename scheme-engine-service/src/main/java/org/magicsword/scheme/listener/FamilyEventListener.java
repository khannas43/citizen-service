package org.magicsword.scheme.listener;

import org.magicsword.scheme.event.FamilyRegistryEvent;
import org.magicsword.scheme.service.SchemeEngineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class FamilyEventListener {

    private static final Logger log = LoggerFactory.getLogger(FamilyEventListener.class);

    private final SchemeEngineService schemeEngineService;

    public FamilyEventListener(SchemeEngineService schemeEngineService) {
        this.schemeEngineService = schemeEngineService;
    }

    @KafkaListener(topics = "family-registry-events", groupId = "scheme-engine")
    public void onEvent(FamilyRegistryEvent event) {
        try {
            schemeEngineService.handleFamilyEvent(event);
        } catch (Exception ex) {
            log.error("Failed to handle family event {}: {}", event, ex.getMessage(), ex);
        }
    }
}
