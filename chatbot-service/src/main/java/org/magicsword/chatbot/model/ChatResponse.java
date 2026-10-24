package org.magicsword.chatbot.model;

public record ChatResponse(String reply, String sessionId, String intent, String navigateTo) {
    public ChatResponse(String reply, String sessionId, String intent) {
        this(reply, sessionId, intent, null);
    }
}
