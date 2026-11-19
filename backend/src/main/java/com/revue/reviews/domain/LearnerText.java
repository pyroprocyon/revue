package com.revue.reviews.domain;

import org.jspecify.annotations.Nullable;

/** Validates text a learner typed before it reaches storage. */
final class LearnerText {
    private LearnerText() {
    }

    static String required(@Nullable String text, int maxLength) {
        String trimmed = optional(text, maxLength);
        if (trimmed == null) {
            throw new IllegalArgumentException("Required text is missing");
        }
        return trimmed;
    }

    static @Nullable String optional(@Nullable String text, int maxLength) {
        if (text == null || text.isBlank()) {
            return null;
        }
        if (text.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("Text contains a null character");
        }
        String trimmed = text.strip();
        if (trimmed.length() > maxLength) {
            throw new IllegalArgumentException("Text is longer than " + maxLength + " characters");
        }
        return trimmed;
    }
}
