package org.magicsword.chatbot.controller;

import org.magicsword.chatbot.model.ChatRequest;
import org.magicsword.chatbot.model.ChatResponse;
import org.magicsword.chatbot.service.ChatbotService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/chat")
@CrossOrigin(originPatterns = "*")
public class ChatController {

    private final ChatbotService chatbotService;

    public ChatController(ChatbotService chatbotService) {
        this.chatbotService = chatbotService;
    }

    @PostMapping
    public ResponseEntity<ChatResponse> chat(@RequestBody ChatRequest req) {
        return ResponseEntity.ok(chatbotService.chat(req));
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "chatbot-service",
                "translation", "STATIC"
        ));
    }
}
