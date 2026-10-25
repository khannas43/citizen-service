package org.citizen.chatbot.model;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

public record ChatSession(
        String sessionId,
        String currentIntent,
        Map<String, String> collected,
        String aadhaarRef,
        Instant lastActivity
) {
    public ChatSession withIntent(String intent) {
        return new ChatSession(sessionId, intent, collected, aadhaarRef, Instant.now());
    }

    public ChatSession withField(String key, String value) {
        var m = new HashMap<>(collected);
        m.put(key, value);
        return new ChatSession(sessionId, currentIntent, m, aadhaarRef, Instant.now());
    }

    public ChatSession withAadhaar(String ref) {
        return new ChatSession(sessionId, currentIntent, collected, ref, Instant.now());
    }

    public ChatSession cleared() {
        return new ChatSession(sessionId, null, new HashMap<>(), aadhaarRef, Instant.now());
    }
}
