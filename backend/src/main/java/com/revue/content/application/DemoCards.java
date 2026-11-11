package com.revue.content.application;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** The five trial cards. The trial runs in the browser and shows each answer only after the visitor flips the card. */
public record DemoCards(String setTitle, String publisherName, List<DemoCard> cards) {

    /** Copies the trial cards so callers cannot change the response after construction. */
    public DemoCards {
        cards = List.copyOf(cards);
    }

    /** One flashcard: the question on the front, the answer and its optional note and source on the back. */
    public record DemoCard(
        String key,
        String question,
        String answer,
        @Nullable String explanation,
        @Nullable String source) {
    }
}
