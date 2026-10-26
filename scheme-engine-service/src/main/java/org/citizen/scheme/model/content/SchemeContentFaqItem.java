package org.citizen.scheme.model.content;

public record SchemeContentFaqItem(
        String question,
        String questionLocal,
        String answer,
        String answerLocal
) {}
