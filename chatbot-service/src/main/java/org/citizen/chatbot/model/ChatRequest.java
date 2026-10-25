package org.citizen.chatbot.model;

public record ChatRequest(String sessionId, String message, String language, String aadhaarRef) {}
