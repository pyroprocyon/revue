package com.revue.content.application;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** The five trial cards. The trial runs in the browser and shows each answer only after the visitor flips the card. */
public record TrialCards(String setTitle, String publisherName, List<TrialCard> cards) {

    /** Copies the trial cards so callers cannot change the response after construction. */
    public TrialCards {
        cards = List.copyOf(cards);
    }

    /** One flashcard: the question on the front, the answer and its optional note and source on the back. */
    public record TrialCard(
        String key,
        String question,
        String answer,
        @Nullable String explanation,
        @Nullable String source) {
    }
}
