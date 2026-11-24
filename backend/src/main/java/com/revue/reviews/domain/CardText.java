package com.revue.reviews.domain;

import org.jspecify.annotations.Nullable;

/** The text of a learner's personal card. A blank optional field is stored as absent. */
public record CardText(
    String question,
    String answer,
    @Nullable String explanation,
    @Nullable String memoryHook,
    @Nullable String source) {
    public static final int MAX_QUESTION = 500;
    public static final int MAX_ANSWER = 300;
    private static final int MAX_LEGACY_ANSWER = 500;
    public static final int MAX_EXPLANATION = 2000;
    public static final int MAX_MEMORY_HOOK = 300;
    public static final int MAX_SOURCE = 500;

    /** Accepts legacy answer length so an existing card can keep its answer when another field changes. */
    public CardText {
        question = LearnerText.required(question, MAX_QUESTION);
        answer = LearnerText.required(answer, MAX_LEGACY_ANSWER);
        explanation = LearnerText.optional(explanation, MAX_EXPLANATION);
        memoryHook = LearnerText.optional(memoryHook, MAX_MEMORY_HOOK);
        source = LearnerText.optional(source, MAX_SOURCE);
    }
}
