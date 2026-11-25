package com.revue.content.application;

import org.jspecify.annotations.Nullable;

/**
 * What a visitor sees about a public set before trying it: no answers and nothing about any student. {@code cardCount}
 * counts the set's active cards.
 */
public record PublicSetSummary(
    String setKey,
    String title,
    String description,
    String publisherName,
    String subject,
    long cardCount,
    boolean trialAvailable,
    String shareCode,
    boolean saveAllowed) {

    /** Detailed preview with the first active question when the set can offer a trial. */
    public record Preview(PublicSetSummary summary, @Nullable String sampleQuestion) {
    }
}
